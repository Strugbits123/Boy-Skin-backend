/**
 * SPF & Sunscreen Utility Functions
 * Validates SPF quality, extracts SPF values, and checks broad spectrum protection
 */

import Product from "../../../models/product.model";
import { ProductUtils } from "./ProductUtils";

export class SPFUtils {

    static extractSpfValueText(p: Product): string {
        const text = [
            p.productName || "",
            p.summary?.plain_text || "",
            ProductUtils.getPrimaryActivesText(p) || "",
            p.format?.name || ""
        ].join(" ").toLowerCase();
        return text;
    }

    static getSPFValue(p: Product): number | null {
        const text = this.extractSpfValueText(p);
        const m = text.match(/spf\s*(\d{1,3})/i);
        if (m) {
            const n = parseInt(m[1] || "0", 10);
            return isNaN(n) ? null : n;
        }
        return null;
    }

    static isBroadSpectrum(p: Product): boolean {
        const text = this.extractSpfValueText(p);
        return /(broad\s*spectrum|pa\+|uva\/?uvb|uv\s*protection)/i.test(text);
    }

    static passesSpfQuality(p: Product): boolean {
        const steps = ProductUtils.productSteps(p);
        if (!steps.includes("protect")) return true;
        const spf = this.getSPFValue(p);
        const text = this.extractSpfValueText(p);
        const hasSpfKeyword = /\bspf\b/.test(text);
        const meetsValue = spf !== null && spf >= 30;
        const meetsSpectrum = this.isBroadSpectrum(p);
        return meetsValue || meetsSpectrum || hasSpfKeyword;
    }
}
