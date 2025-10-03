interface Brand {
    id: string;
    name: string;
}

interface TextProperty {
    id: string;
    plain_text: string;
}

interface MultiSelectItem {
    id: string;
    name: string;
    color: string;
}

interface SelectProperty {
    id: string;
    name: string;
    color: string;
}

interface Product {
    productId: string;
    productName: string;
    brand: Brand;
    ingredientList: TextProperty;
    summary: TextProperty;
    skinType: MultiSelectItem[];
    format: MultiSelectItem;
    skinConcern: MultiSelectItem[];
    price: number | null;
    function: MultiSelectItem[];
    cannotMixWith: MultiSelectItem[];
    link: string;
    primaryActiveIngredients: TextProperty;
    requiresSPF: SelectProperty;
    step: MultiSelectItem[];
    usageTime: MultiSelectItem[];
    sensitiveSkinFriendly: SelectProperty;
}

export default Product;
export type { MultiSelectItem };
