import DatabaseConfig from "../config/db";
import Product from "../models/product.model";
import { CacheState, EnhancedProductCache } from "../models/cache.model";
import { NotionSelectItem } from "../models/notion.model";
import { AICompatibleQuizModel } from "../models/quiz.model";
import fs from 'fs';
import path from 'path';
/**
 * Database Service - Handles all database operations, caching, and Notion API integration
 * Provides enhanced product categorization and quality scoring for premium product recommendations
 */
class DbService {
    private static cache: CacheState = {
        products: [],
        lastUpdated: new Date(0),
        isUpdating: false,
        updateAttempts: 0,
        maxRetries: 3
    };

    private static readonly CACHE_DURATION = 30 * 60 * 1000;
    private static enhancedCache: EnhancedProductCache = {
        bySkinType: { dry: [], oily: [], combination: [], normal: [], sensitive: [] },
        byQuality: { premium: [], midRange: [], basic: [] },
        byConcern: { acne: [], hyperpigmentation: [], dryness: [], finelines: [], redness: [], texture: [] },
        lastUpdated: new Date(0),
        totalProducts: 0
    };
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
    private static calculateProductQualityScore(product: Product): number {
        try {
            let score = 0;

            const primaryActives = product.primaryActiveIngredients || [];
            const premiumActives: Record<string, number> = {
                "Azelaic Acid": 10, "Retinol": 10, "Vitamin C": 9,
                "Niacinamide": 8, "Salicylic Acid": 9, "Hyaluronic Acid": 8,
                "Glycolic Acid": 9, "Peptides": 7, "Ceramides": 6
            };

            primaryActives.forEach(active => {
                const activeName = active.name || "";
                Object.keys(premiumActives).forEach(premiumActive => {
                    if (activeName.toLowerCase().includes(premiumActive.toLowerCase())) {
                        score += premiumActives[premiumActive] ?? 0;
                    }
                });
            });

            const functions = product.function || [];
            const functionScores: Record<string, number> = {
                "Exfoliate": 10, "Spot Treatment": 9, "Treat": 8,
                "Protect": 8, "Hydrate": 7, "Cleanse": 6
            };

            functions.forEach(func => {
                const funcName = func.name || "";
                Object.keys(functionScores).forEach(scoredFunc => {
                    if (funcName.includes(scoredFunc)) {
                        score += functionScores[scoredFunc] ?? 0;
                    }
                });
            });

            const price = product.price || 0;
            if (price >= 25) score += 15;
            else if (price >= 18) score += 12;
            else if (price >= 12) score += 8;
            else if (price >= 8) score += 4;

            if (primaryActives.length >= 2) score += 8;

            return Math.max(0, score);

        } catch (error) {
            console.error('Error calculating quality score:', error);
            return 0;
        }
    }

    private static distributeProductsByCategories(products: Product[]): void {
        try {
            this.enhancedCache.bySkinType = { dry: [], oily: [], combination: [], normal: [], sensitive: [] };
            this.enhancedCache.byQuality = { premium: [], midRange: [], basic: [] };
            this.enhancedCache.byConcern = { acne: [], hyperpigmentation: [], dryness: [], finelines: [], redness: [], texture: [] };

            products.forEach(product => {
                const qualityScore = this.calculateProductQualityScore(product);

                if (qualityScore >= 30) {
                    this.enhancedCache.byQuality.premium.push(product);
                } else if (qualityScore >= 15) {
                    this.enhancedCache.byQuality.midRange.push(product);
                } else {
                    this.enhancedCache.byQuality.basic.push(product);
                }

                (product.skinType || []).forEach(skinType => {
                    const typeName = (skinType.name || "").toLowerCase();
                    if (typeName.includes('dry')) {
                        this.enhancedCache.bySkinType.dry.push(product);
                    }
                    if (typeName.includes('oily')) {
                        this.enhancedCache.bySkinType.oily.push(product);
                    }
                    if (typeName.includes('combination')) {
                        this.enhancedCache.bySkinType.combination.push(product);
                    }
                    if (typeName.includes('normal')) {
                        this.enhancedCache.bySkinType.normal.push(product);
                    }
                    if (typeName.includes('sensitive')) {
                        this.enhancedCache.bySkinType.sensitive.push(product);
                    }
                });

                (product.skinConcern || []).forEach(concern => {
                    const concernName = (concern.name || "").toLowerCase();
                    if (concernName.includes('acne')) {
                        this.enhancedCache.byConcern.acne.push(product);
                    }
                    if (concernName.includes('hyperpigmentation') || concernName.includes('dark spot')) {
                        this.enhancedCache.byConcern.hyperpigmentation.push(product);
                    }
                    if (concernName.includes('dryness') || concernName.includes('dry')) {
                        this.enhancedCache.byConcern.dryness.push(product);
                    }
                    if (concernName.includes('fine line') || concernName.includes('aging')) {
                        this.enhancedCache.byConcern.finelines.push(product);
                    }
                    if (concernName.includes('redness') || concernName.includes('irritation')) {
                        this.enhancedCache.byConcern.redness.push(product);
                    }
                    if (concernName.includes('texture') || concernName.includes('rough')) {
                        this.enhancedCache.byConcern.texture.push(product);
                    }
                });
            });

            this.enhancedCache.totalProducts = products.length;
            this.enhancedCache.lastUpdated = new Date();

            console.log('🚀 Enhanced Cache Populated:', {
                total: this.enhancedCache.totalProducts,
                premium: this.enhancedCache.byQuality.premium.length,
                midRange: this.enhancedCache.byQuality.midRange.length,
                basic: this.enhancedCache.byQuality.basic.length
            });

        } catch (error) {
            console.error('Error distributing products by categories:', error);
        }
    }

    static isBestProduct(product: Product): boolean {
        try {
            const primaryActives = product.primaryActiveIngredients || [];
            const functions = product.function || [];
            const price = product.price || 0;

            const topActives = ["Azelaic Acid", "Retinol", "Vitamin C", "Niacinamide", "Salicylic Acid", "Hyaluronic Acid"];
            const topFunctions = ["Treat", "Spot Treatment", "Exfoliate", "Protect"];

            const hasTopActive = primaryActives.some(active =>
                topActives.some(topActive =>
                    (active.name || "").toLowerCase().includes(topActive.toLowerCase())
                )
            );

            const hasTopFunction = functions.some(func =>
                topFunctions.some(topFunc =>
                    (func.name || "").includes(topFunc)
                )
            );

            const hasPremiumPrice = price >= 18;
            const hasMultipleActives = primaryActives.length >= 2;

            return (hasTopActive && hasTopFunction) || (hasTopActive && hasPremiumPrice) || (hasTopFunction && hasMultipleActives);

        } catch (error) {
            console.error('Error checking if product is best:', error);
            return false;
        }
    }

    static isBestProductForUser(product: Product, aiQuiz: AICompatibleQuizModel): boolean {
        try {
            if (!this.isBestProduct(product)) return false;

            const userSkinType = aiQuiz.skinAssessment.skinType.toLowerCase();
            const userConcerns = [...aiQuiz.concerns.primary, ...aiQuiz.concerns.secondary].map(c => c.toLowerCase());
            const isSensitive = aiQuiz.skinAssessment.skinSensitivity === "sensitive";

            const productSkinTypes = (product.skinType || []).map(st => (st.name || "").toLowerCase());
            const skinTypeMatch = productSkinTypes.some(pst => pst.includes(userSkinType));

            const productConcerns = (product.skinConcern || []).map(sc => (sc.name || "").toLowerCase());
            const concernMatch = userConcerns.some(uc =>
                productConcerns.some(pc => pc.includes(uc) || uc.includes(pc))
            );

            if (isSensitive) {
                const sensitiveFriendly = (product.sensitiveSkinFriendly?.name || "").toLowerCase();
                if (sensitiveFriendly.includes("no")) return false;
            }

            return skinTypeMatch && concernMatch;

        } catch (error) {
            console.error('Error checking if product is best for user:', error);
            return false;
        }
    }

    static async getBestProductsForUser(aiQuiz: AICompatibleQuizModel): Promise<Product[]> {
        try {
            const allProducts = await this.getCachedNotionProducts();

            const bestProducts = allProducts.filter(product =>
                this.isBestProductForUser(product, aiQuiz)
            );

            const scoredProducts = bestProducts.map(product => {
                const qualityScore = this.calculateProductQualityScore(product);
                const userSkinType = aiQuiz.skinAssessment.skinType.toLowerCase();
                const userConcerns = [...aiQuiz.concerns.primary, ...aiQuiz.concerns.secondary];

                let skinTypeScore = 0;
                const productSkinTypes = (product.skinType || []).map(st => (st.name || "").toLowerCase());
                if (productSkinTypes.some(pst => pst.includes(userSkinType))) {
                    skinTypeScore = 10;
                }

                let concernScore = 0;
                const productConcerns = (product.skinConcern || []).map(sc => (sc.name || "").toLowerCase());
                userConcerns.forEach(uc => {
                    if (productConcerns.some(pc => pc.includes(uc.toLowerCase()) || uc.toLowerCase().includes(pc))) {
                        concernScore += 5;
                    }
                });

                const totalScore = qualityScore + skinTypeScore + concernScore;
                return { product, score: totalScore };
            });

            scoredProducts.sort((a, b) => b.score - a.score);
            let finalProducts = scoredProducts.map(sp => sp.product);

            // ESSENTIAL PRODUCT GUARANTEE SYSTEM
            const essentialProducts = this.ensureEssentialProducts(finalProducts, allProducts, aiQuiz);

            // Merge essential products with existing results, avoiding duplicates
            const productIds = new Set(finalProducts.map(p => p.productId));
            essentialProducts.forEach(product => {
                if (!productIds.has(product.productId)) {
                    finalProducts.unshift(product);
                    productIds.add(product.productId);
                }
            });

            // Final check before return
            console.log('✅ Essential Products Check:', {
                hasCleanser: this.hasProductCategory(finalProducts, 'cleanser'),
                hasMoisturizer: this.hasProductCategory(finalProducts, 'moisturizer'),
                hasSPF: this.hasProductCategory(finalProducts, 'spf')
            });

            return finalProducts;

        } catch (error) {
            console.error('Error getting best products for user:', error);
            return [];
        }
    }

    private static hasProductCategory(products: Product[], category: string): boolean {
        return products.some(product => {
            const functions = (product.function || []).map(f => (f.name || "").toLowerCase());
            const steps = (product.step || []).map(s => (s.name || "").toLowerCase());
            const productName = (product.productName || "").toLowerCase();

            switch (category) {
                case 'cleanser':
                    return functions.some(f => f.includes('cleanse')) ||
                        steps.some(s => s.includes('cleanse')) ||
                        productName.includes('cleanser') || productName.includes('wash');
                case 'moisturizer':
                    return functions.some(f => f.includes('hydrate') || f.includes('moisturiz')) ||
                        steps.some(s => s.includes('moisturiz')) ||
                        productName.includes('moisturizer') || productName.includes('cream') || productName.includes('lotion');
                case 'spf':
                    return productName.includes('spf') || productName.includes('sunscreen') ||
                        functions.some(f => f.includes('protect')) ||
                        steps.some(s => s.includes('protect'));
                default:
                    return false;
            }
        });
    }

    private static getBestProductOfCategory(allProducts: Product[], category: string, aiQuiz: AICompatibleQuizModel): Product | null {
        const categoryProducts = allProducts.filter(product => {
            const functions = (product.function || []).map(f => (f.name || "").toLowerCase());
            const steps = (product.step || []).map(s => (s.name || "").toLowerCase());
            const productName = (product.productName || "").toLowerCase();

            let isCategory = false;
            switch (category) {
                case 'cleanser':
                    isCategory = functions.some(f => f.includes('cleanse')) ||
                        steps.some(s => s.includes('cleanse')) ||
                        productName.includes('cleanser') || productName.includes('wash');
                    break;
                case 'moisturizer':
                    isCategory = functions.some(f => f.includes('hydrate') || f.includes('moisturiz')) ||
                        steps.some(s => s.includes('moisturiz')) ||
                        productName.includes('moisturizer') || productName.includes('cream') || productName.includes('lotion');
                    break;
                case 'spf':
                    isCategory = productName.includes('spf') || productName.includes('sunscreen') ||
                        functions.some(f => f.includes('protect')) ||
                        steps.some(s => s.includes('protect'));
                    break;
            }

            return isCategory;
        });

        if (categoryProducts.length === 0) return null;

        // Score and sort category products
        const scoredProducts = categoryProducts.map(product => {
            const qualityScore = this.calculateProductQualityScore(product);
            const userSkinType = aiQuiz.skinAssessment.skinType.toLowerCase();

            let skinTypeScore = 0;
            const productSkinTypes = (product.skinType || []).map(st => (st.name || "").toLowerCase());
            if (productSkinTypes.some(pst => pst.includes(userSkinType))) {
                skinTypeScore = 10;
            }

            let concernScore = 0;
            const userConcerns = [...aiQuiz.concerns.primary, ...aiQuiz.concerns.secondary];
            const productConcerns = (product.skinConcern || []).map(sc => (sc.name || "").toLowerCase());
            userConcerns.forEach(uc => {
                if (productConcerns.some(pc => pc.includes(uc.toLowerCase()) || uc.toLowerCase().includes(pc))) {
                    concernScore += 5;
                }
            });

            // Bonus for sensitive skin compatibility
            const isSensitive = aiQuiz.skinAssessment.skinSensitivity === "sensitive";
            let sensitivityBonus = 0;
            if (isSensitive) {
                const sensitiveFriendly = (product.sensitiveSkinFriendly?.name || "").toLowerCase();
                if (sensitiveFriendly.includes("yes")) sensitivityBonus = 5;
            }

            const totalScore = qualityScore + skinTypeScore + concernScore + sensitivityBonus;
            return { product, score: totalScore };
        });

        scoredProducts.sort((a, b) => b.score - a.score);
        return scoredProducts.length > 0 && scoredProducts[0] ? scoredProducts[0].product : null;
    }

    private static ensureEssentialProducts(currentProducts: Product[], allProducts: Product[], aiQuiz: AICompatibleQuizModel): Product[] {
        const essentialProducts: Product[] = [];

        // Check if we have essential categories
        const hasCleanser = this.hasProductCategory(currentProducts, 'cleanser');
        const hasMoisturizer = this.hasProductCategory(currentProducts, 'moisturizer');
        const hasSPF = this.hasProductCategory(currentProducts, 'spf');

        // Add missing essential products
        if (!hasCleanser) {
            const bestCleanser = this.getBestProductOfCategory(allProducts, 'cleanser', aiQuiz);
            if (bestCleanser) {
                essentialProducts.push(bestCleanser);
            }
        }

        if (!hasMoisturizer) {
            const bestMoisturizer = this.getBestProductOfCategory(allProducts, 'moisturizer', aiQuiz);
            if (bestMoisturizer) {
                essentialProducts.push(bestMoisturizer);
            }
        }

        if (!hasSPF) {
            const bestSPF = this.getBestProductOfCategory(allProducts, 'spf', aiQuiz);
            if (bestSPF) {
                essentialProducts.push(bestSPF);
            }
        }

        return essentialProducts;
    }

    static async getCachedNotionProducts(): Promise<Product[]> {
        try {
            const now = new Date();
            const cacheAge = now.getTime() - this.cache.lastUpdated.getTime();
            const isCacheExpired = cacheAge > this.CACHE_DURATION;

            if (!isCacheExpired && this.cache.products.length > 0) {
                return this.cache.products;
            }

            if (!this.cache.isUpdating) {
                this.refreshCacheAsync();
            }

            if (this.cache.products.length > 0) {
                return this.cache.products;
            }

            return await this.getNotionProducts();

        } catch (error: any) {
            console.error(`Cache error: ${error.message}`);

            if (error.message.includes('missing in .env')) {
                console.error(`CONFIGURATION ERROR: Please create .env file with Notion credentials`);
                return [];
            }

            return await this.getNotionProducts();
            return await this.getNotionProducts();
        }
    }

    private static async refreshCacheAsync(): Promise<void> {
        if (this.cache.isUpdating) return;

        this.cache.isUpdating = true;
        this.cache.updateAttempts++;

        try {
            const freshProducts = await this.getNotionProducts();

            this.cache.products = freshProducts;
            this.cache.lastUpdated = new Date();
            this.cache.updateAttempts = 0;

            this.distributeProductsByCategories(freshProducts);

        } catch (error: any) {
            if (this.cache.updateAttempts >= this.cache.maxRetries) {
                console.error(`Max cache refresh attempts reached: ${error.message}`);
                this.cache.updateAttempts = 0;
            }
        } finally {
            this.cache.isUpdating = false;
        }
    }

    static async startCacheUpdateCron(): Promise<void> {
        console.log(`Cache system started (30min intervals)`);

        try {
            const products = await this.getNotionProducts();
            this.cache.products = products;
            this.cache.lastUpdated = new Date();
            this.cache.updateAttempts = 0;

            this.distributeProductsByCategories(products);
        } catch (error: any) {
            console.error(`Initial cache load failed: ${error.message}`);
        }

        setInterval(async () => {
            try {
                await this.refreshCacheAsync();
            } catch (error: any) {
                console.error(`Cache cron failed: ${error.message}`);
            }
        }, this.CACHE_DURATION);
    }

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

            const products: Product[] = data.results.map((page: any, index: number) => {
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
                        strengthRatingOfActives: props?.['Strength Rating of Actives']?.multi_select?.map((item: NotionSelectItem) => ({
                            id: item.id || "",
                            name: item.name || "",
                            color: item.color || ""
                        })) || [],
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

                        primaryActiveIngredients: props?.['Primary Active Ingredient(s)']?.multi_select?.map((item: NotionSelectItem) => ({
                            id: item.id || "",
                            name: item.name || "",
                            color: item.color || ""
                        })) || [],

                        step: props?.Step?.multi_select?.map((item: NotionSelectItem) => ({
                            id: item.id || "",
                            name: item.name || "",
                            color: item.color || ""
                        })) || [],

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
    static getBestProductsForProfile(aiQuiz: AICompatibleQuizModel): Product[] {
        try {
            const skinType = aiQuiz.skinAssessment.skinType;
            const concerns = [...aiQuiz.concerns.primary, ...aiQuiz.concerns.secondary];

            type SkinTypeKey = keyof typeof this.enhancedCache.bySkinType;
            const skinTypeKey = skinType.toLowerCase() as SkinTypeKey;
            const validKeys: SkinTypeKey[] = ['dry', 'oily', 'combination', 'normal', 'sensitive'];

            let candidateProducts: Product[] = [];

            if (validKeys.includes(skinTypeKey)) {
                candidateProducts = [...this.enhancedCache.bySkinType[skinTypeKey]];
            }

            if (candidateProducts.length === 0) {
                candidateProducts = [...this.enhancedCache.byQuality.premium, ...this.enhancedCache.byQuality.midRange];
            }

            const scoredProducts = candidateProducts.map(product => {
                const qualityScore = this.calculateProductQualityScore(product);

                let concernScore = 0;
                const productConcerns = (product.skinConcern || [])
                    .map((c: any) => (c.name || "").toLowerCase());

                concerns.forEach(concern => {
                    if (productConcerns.some((pc: string) => pc.includes(concern.toLowerCase()))) {
                        concernScore += 5;
                    }
                });

                const skinTypeMatch = (product.skinType || [])
                    .some((st: any) => (st.name || "").toLowerCase().includes(skinType.toLowerCase())) ? 10 : 0;

                const totalScore = qualityScore + concernScore + skinTypeMatch;

                return { product, score: totalScore };
            }).sort((a, b) => b.score - a.score);

            return scoredProducts.map(sp => sp.product);
        } catch (error) {
            console.error('Error getting best products:', error);
            return [];
        }
    }

    static getEnhancedCacheStats() {
        return {
            totalProducts: this.enhancedCache.totalProducts,
            bySkinType: {
                dry: this.enhancedCache.bySkinType.dry.length,
                oily: this.enhancedCache.bySkinType.oily.length,
                combination: this.enhancedCache.bySkinType.combination.length,
                normal: this.enhancedCache.bySkinType.normal.length,
                sensitive: this.enhancedCache.bySkinType.sensitive.length
            },
            byQuality: {
                premium: this.enhancedCache.byQuality.premium.length,
                midRange: this.enhancedCache.byQuality.midRange.length,
                basic: this.enhancedCache.byQuality.basic.length
            },
            lastUpdated: this.enhancedCache.lastUpdated
        };
    }
}

export default DbService;
export type { Product };