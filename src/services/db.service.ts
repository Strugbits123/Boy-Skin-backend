import { Console } from "console";
import DatabaseConfig from "../config/db";
import Product from "../models/product.model";

interface CacheState {
    products: Product[];
    lastUpdated: Date;
    isUpdating: boolean;
    updateAttempts: number;
    maxRetries: number;
}

interface NotionSelectItem {
    id: string;
    name: string;
    color: string;
}

class DbService {
    private static cache: CacheState = {
        products: [],
        lastUpdated: new Date(0),
        isUpdating: false,
        updateAttempts: 0,
        maxRetries: 3
    };

    private static readonly CACHE_DURATION = 30 * 60 * 1000;
    static async insertOneData(collectionName: string, data: any) {
        try {
            const db = await DatabaseConfig.getDatabase();
            const result = await db.collection(collectionName).insertOne(data);
            let id = result.insertedId.toString();
            return id;
        } catch (error: any) {
            const message = error?.message ?? "Unknown Error occurred in Inserting";
            throw new Error(message);
        }
    }
    static async updateOneData(collectionName: string, data: any, query: any) {
        try {
            const db = await DatabaseConfig.getDatabase();
            const result = await db.collection(collectionName).updateOne(query, { $set: data });
            return result.modifiedCount;
        } catch (error: any) {
            const message = error?.message ?? "Unknown Error occurred in Updating";
            throw new Error(message);
        }
    }
    static async getCachedNotionProducts(): Promise<Product[]> {
        try {
            const now = new Date();
            const cacheAge = now.getTime() - this.cache.lastUpdated.getTime();
            const isCacheExpired = cacheAge > this.CACHE_DURATION;

            // Return cache if valid and not empty
            if (!isCacheExpired && this.cache.products.length > 0) {
                return this.cache.products;
            }

            // If cache expired or empty, try to refresh
            if (!this.cache.isUpdating) {
                this.refreshCacheAsync(); // Non-blocking refresh
            }

            // Return stale cache if available while refreshing
            if (this.cache.products.length > 0) {
                return this.cache.products;
            }

            // Last resort: blocking fetch if no cache exists
            return await this.getNotionProducts();

        } catch (error: any) {
            console.error(`❌ Cache error: ${error.message}`);

            // Check if it's a configuration issue
            if (error.message.includes('missing in .env')) {
                console.error(`🚨 CONFIGURATION ERROR: Please create .env file with Notion credentials`);
                return []; // Return empty array to prevent crashes
            }

            // Fallback to direct fetch for other errors
            return await this.getNotionProducts();
        }
    }

    // Async cache refresh (non-blocking)
    private static async refreshCacheAsync(): Promise<void> {
        if (this.cache.isUpdating) return;

        this.cache.isUpdating = true;
        this.cache.updateAttempts++;

        try {
            const freshProducts = await this.getNotionProducts();

            // Update cache
            this.cache.products = freshProducts;
            this.cache.lastUpdated = new Date();
            this.cache.updateAttempts = 0;

        } catch (error: any) {
            // Reset attempts if max retries reached
            if (this.cache.updateAttempts >= this.cache.maxRetries) {
                console.error(`🚨 Max cache refresh attempts reached: ${error.message}`);
                this.cache.updateAttempts = 0;
            }
        } finally {
            this.cache.isUpdating = false;
        }
    }

    // Start cron job for automatic cache updates
    static async startCacheUpdateCron(): Promise<void> {
        console.log(`🕐 Cache system started (30min intervals)`);

        // Initial cache load - synchronous
        try {
            const products = await this.getNotionProducts();
            this.cache.products = products;
            this.cache.lastUpdated = new Date();
            this.cache.updateAttempts = 0;
        } catch (error: any) {
            console.error(`Initial cache load failed: ${error.message}`);
        }

        // Set interval for 30 minutes
        setInterval(async () => {
            try {
                await this.refreshCacheAsync();
            } catch (error: any) {
                console.error(`❌ Cache cron failed: ${error.message}`);
            }
        }, this.CACHE_DURATION);
    }

    // Get cache stats for monitoring
    static getCacheStats() {
        const now = new Date();
        const cacheAge = now.getTime() - this.cache.lastUpdated.getTime();

        return {
            productsCount: this.cache.products.length,
            lastUpdated: this.cache.lastUpdated,
            ageMinutes: Math.round(cacheAge / 1000 / 60),
            isUpdating: this.cache.isUpdating,
            updateAttempts: this.cache.updateAttempts,
            isExpired: cacheAge > this.CACHE_DURATION
        };
    }

    static async getNotionProducts(): Promise<Product[]> {
        try {
            const databaseId = process.env.NOTION_DATABASE_ID;
            const accessKey = process.env.NOTION_ACCESS_KEY;

            if (!databaseId) {
                throw new Error("NOTION_DATABASE_ID is missing in .env");
            }
            if (!accessKey) {
                throw new Error("NOTION_ACCESS_KEY is missing in .env");
            }
            const response = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessKey}`,
                    'Content-Type': 'application/json',
                    'Notion-Version': '2022-06-28'
                },
                body: JSON.stringify({
                    page_size: 100
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Notion API failed with status ${response.status}: ${errorText}`);
            }

            const data: any = await response.json();

            if (!data.results || !Array.isArray(data.results)) {
                throw new Error("Invalid response format from Notion API");
            }

            const products: Product[] = data.results.map((page: any) => {
                try {
                    const props = page.properties;

                    return {
                        productId: page.id || "",
                        imageUrl: props?.["Image Link"]?.url || "",
                        productName: props?.['Product Name']?.title?.[0]?.plain_text || "",
                        format: props?.["Format"]?.select || {

                        },
                        brand: {
                            id: props?.Brand?.select?.id || "",
                            name: props?.Brand?.select?.name || ""
                        },

                        ingredientList: {
                            id: props?.['Ingredient list (all)']?.id || "",
                            plain_text: props?.['Ingredient list (all)']?.rich_text?.[0]?.plain_text || ""
                        },

                        summary: {
                            id: props?.Summary?.id || "",
                            plain_text: props?.Summary?.rich_text?.[0]?.plain_text || ""
                        },

                        skinType: props?.['Skin Type']?.multi_select?.map((item: NotionSelectItem) => ({
                            id: item.id || "",
                            name: item.name || "",
                            color: item.color || ""
                        })) || [],

                        skinConcern: props?.['Skin Concern']?.multi_select?.map((item: NotionSelectItem) => ({
                            id: item.id || "",
                            name: item.name || "",
                            color: item.color || ""
                        })) || [],

                        price: props?.Price?.number || null,

                        function: props?.['Function']?.multi_select?.map((item: NotionSelectItem) => ({
                            id: item.id || "",
                            name: item.name || "",
                            color: item.color || ""
                        })) || [],

                        cannotMixWith: props?.['Cannot Mix With']?.multi_select?.map((item: NotionSelectItem) => ({
                            id: item.id || "",
                            name: item.name || "",
                            color: item.color || ""
                        })) || [],

                        link: props?.Link?.url || "",

                        primaryActiveIngredients: {
                            id: props?.['Primary Active Ingredients']?.id || "",
                            plain_text: props?.['Primary Active Ingredients']?.rich_text?.[0]?.plain_text || ""
                        },

                        requiresSPF: {
                            id: props?.['Requires SPF']?.select?.id || "",
                            name: props?.['Requires SPF']?.select?.name || "",
                            color: props?.['Requires SPF']?.select?.color || ""
                        },

                        step: props?.Step?.select ? [{
                            id: props.Step.select.id || "",
                            name: props.Step.select.name || "",
                            color: props.Step.select.color || ""
                        }] : [],

                        usageTime: props?.['Usage Time']?.multi_select?.map((item: NotionSelectItem) => ({
                            id: item.id || "",
                            name: item.name || "",
                            color: item.color || ""
                        })) || [],

                        sensitiveSkinFriendly: {
                            id: props?.['Sensitive Skin Friendly']?.select?.id || "",
                            name: props?.['Sensitive Skin Friendly']?.select?.name || "",
                            color: props?.['Sensitive Skin Friendly']?.select?.color || ""
                        }
                    };
                } catch (mappingError: any) {
                    throw new Error(`Error mapping product ${page.id}: ${mappingError.message}`);
                }
            });

            return products;

        } catch (error: any) {
            if (error.message.includes('fetch')) {
                throw new Error("Network error: Unable to connect to Notion API");
            }
            throw new Error(`Failed to fetch Notion products: ${error.message}`);
        }
    }

    static async getProductData() {
        try {
            const response = await this.getNotionProducts();
            return response;
        } catch (error: any) {
            console.log(`Error in Loading Products : ${error?.message ?? "Unknown Error"}`)
            return [];
        }
    }
    static async getRecommendationDoc(): Promise<string> {
        try {
            const pageId = process.env.NOTION_PAGE_ID?.trim();
            const accessKey = process.env.NOTION_ACCESS_KEY?.trim();

            if (!pageId) {
                throw new Error("NOTION_PAGE_ID is missing in .env");
            }
            if (!accessKey) {
                throw new Error("NOTION_ACCESS_KEY is missing in .env");
            }

            let allBlocks: any[] = [];
            let cursor: string | undefined = undefined;
            do {
                const url = `https://api.notion.com/v1/blocks/${pageId}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ""}`;

                const response = await fetch(url, {
                    method: "GET",
                    headers: {
                        Authorization: `Bearer ${accessKey}`,
                        "Content-Type": "application/json",
                        "Notion-Version": "2022-06-28",
                    },
                });

                if (!response.ok) {
                    const errText = await response.text().catch(() => "Unknown error");
                    throw new Error(`Notion API Error [${response.status}]: ${errText}`);
                }

                const data: any = await response.json().catch(() => null);

                if (!data || !Array.isArray(data.results)) {
                    throw new Error("Invalid response from Notion API: results missing");
                }

                allBlocks.push(...data.results);

                cursor = data.next_cursor ?? undefined;
            } while (cursor);
            const extractText = (blocks: any[]): string[] => {
                return blocks
                    .map((block) => {
                        try {
                            if (block?.type && Array.isArray(block[block.type]?.rich_text)) {
                                return block[block.type].rich_text
                                    .map((t: any) => t?.plain_text ?? "")
                                    .join("")
                                    .trim();
                            }
                        } catch (err) {
                            console.warn("Failed to parse block:", err);
                        }
                        return "";
                    })
                    .filter((line) => line.length > 0);
            };

            const plainTextArray = extractText(allBlocks);
            const plainText = plainTextArray.join("\n");

            return plainText || "";
        } catch (error: any) {
            const message =
                error?.message ?? "Unknown error occurred while fetching Notion doc.";
            console.error("Error in getRecommendationDoc:", message);
            throw new Error(message);
        }
    }
    static async getOneData(collectionName: string, query: any) {
        try {
            const db = await DatabaseConfig.getDatabase();
            const result = await db.collection(collectionName).findOne(query);
            return result;
        } catch (error: any) {
            const message = error?.message ?? "Unknown Error occurred in getOneData";
            throw new Error(message);
        }
    }
}

export default DbService;
export type { Product };