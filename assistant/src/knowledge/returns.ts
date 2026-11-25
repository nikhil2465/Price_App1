import type { CategoryId, MarketplaceId } from "../domain/pricewise-types.js";

/**
 * Returns, refunds and escalation guidance.
 *
 * IMPORTANT: marketplace policies change often and differ by seller and
 * listing. The authoritative return window is always the listing's own
 * `returnDays` (from live offer data). This module holds *general* guidance
 * only, and every answer built from it tells the buyer to confirm on the
 * product page. Review and update this file against each marketplace's
 * published policy before launch (owner: product/legal).
 */

export const RETURNS_KB_REVIEWED_AT = "2026-11-25";

const CATEGORY_NOTES: Record<CategoryId, string[]> = {
  smartphones: [
    "Phones are usually replacement-only for a defective, damaged or wrong item, not a change-of-mind return.",
    "Many stores require the defect to be confirmed by the brand's service centre or a technician visit before a replacement.",
    "Record an unboxing video and check the IMEI on the box matches the phone (dial *#06#).",
  ],
  laptops: [
    "Laptops are usually replacement-only for defects; some listings need the brand's service centre to confirm the issue.",
    "Do not register the warranty or remove protective stickers until you have checked the device, if you may need to return it.",
  ],
  headphones: [
    "In-ear products are often non-returnable for hygiene reasons once opened, except for defects.",
    "Keep all packaging and accessories; a missing accessory can void the return.",
  ],
  televisions: [
    "TVs are typically checked at installation by the brand's technician; report screen damage at delivery or installation, not later.",
    "Refuse delivery if the box is visibly damaged, or accept only after open-box inspection where offered.",
  ],
  smartwatches: [
    "Smartwatches are usually replacement-only for defects; check compatibility with your phone (some work only with Android or only with iPhone) before buying.",
  ],
  appliances: [
    "Large appliances are usually inspected at installation by the brand; report damage then.",
    "Returns are usually limited to damaged, defective or wrong items; installation charges and extra materials may not be refunded.",
  ],
  fashion: [
    "Fashion usually allows change-of-mind and size returns if tags are intact and the item is unused.",
    "Innerwear, swimwear and some accessories are commonly non-returnable.",
  ],
  beauty: [
    "Beauty products are usually non-returnable once opened; returns are mostly for damaged, expired or wrong items reported quickly.",
    "Check the manufacturing and expiry date on delivery.",
  ],
};

const MARKETPLACE_NOTES: Partial<Record<MarketplaceId, string>> = {
  amazon: "Start from Your Orders > Return or replace items. Some listings show 'Replacement only'.",
  flipkart: "Start from My Orders > Return/Replace. Many electronics listings say 'replacement only'.",
  croma: "Raise it with Croma customer care or at a store with the invoice; electronics returns usually need a defect confirmation.",
  "reliance-digital": "Raise it with Reliance Digital customer care or at a store with the invoice.",
  "vijay-sales": "Raise it with Vijay Sales customer care or at a store with the invoice.",
  "tata-cliq": "Start from My Orders on Tata CLiQ; check whether the listing is sold by Tata CLiQ or a third-party seller.",
  myntra: "Start from Orders on Myntra; some items are marked 'non-returnable' or 'exchange only'.",
  ajio: "Start from My Orders on AJIO; some items are marked non-returnable.",
  nykaa: "Most beauty items are non-returnable once opened; raise damaged or wrong items from My Orders quickly.",
};

export const ESCALATION_STEPS: string[] = [
  "Raise the return or complaint in the marketplace app first and note the ticket or request number.",
  "If it is refused or ignored, write to the marketplace's grievance officer. Indian e-commerce rules require marketplaces to publish one and to acknowledge complaints.",
  "Keep evidence: invoice, order id, unboxing video, photos, chat transcripts.",
  "If still unresolved, file a complaint with the National Consumer Helpline (call 1915 or use the NCH app or website).",
  "As a last step, you can file a consumer complaint online through the e-Daakhil portal.",
];

export interface ReturnGuidance {
  marketplaceId: MarketplaceId;
  category: CategoryId;
  listingReturnDays: number | null;
  listingSummary: string;
  categoryNotes: string[];
  howToStart: string | null;
  escalation: string[];
  disclaimer: string;
  reviewedAt: string;
}

export function getReturnGuidance(marketplaceId: MarketplaceId, category: CategoryId, listingReturnDays: number | null): ReturnGuidance {
  let listingSummary: string;
  if (listingReturnDays === null) listingSummary = "This store's listing for the product was not found, so its exact return window is unknown.";
  else if (listingReturnDays === 0) listingSummary = "This listing does not accept returns (0 days). Only damaged, defective or wrong items may be covered.";
  else listingSummary = `This listing shows a ${listingReturnDays} day return/replacement window from delivery.`;
  return {
    marketplaceId,
    category,
    listingReturnDays,
    listingSummary,
    categoryNotes: CATEGORY_NOTES[category],
    howToStart: MARKETPLACE_NOTES[marketplaceId] ?? null,
    escalation: ESCALATION_STEPS,
    disclaimer: "General guidance, not legal advice. Policies vary by seller and change often: confirm the return terms on the product page before buying.",
    reviewedAt: RETURNS_KB_REVIEWED_AT,
  };
}
