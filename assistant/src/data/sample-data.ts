import type { BankOffer, CategoryId, MarketplaceId, Product } from "../domain/pricewise-types.js";

/**
 * SAMPLE catalogue. Prices, sellers and histories are illustrative, not live
 * marketplace data, and every offer built from it is tagged dataSource "sample".
 * Several products deliberately carry the situations the assistant must handle:
 *   - boat-airdopes-141: MRP far above anything it has sold for (inflated MRP)
 *   - samsung-galaxy-s25-256gb on Flipkart: price raised ~2 weeks before a "sale"
 *   - sony-wh-1000xm5 on Amazon: unusually cheap third-party seller, low rating, no returns
 *   - jbl-tune-770nc on Croma: out of stock
 *   - redmi-note-14-pro-256gb, hp-victus (Flipkart): prices falling steadily (a "wait or buy" case)
 */

export type HistoryScenario = "normal" | "pre-sale-hike" | "steady-decline";

export interface SampleOfferSpec {
  marketplaceId: MarketplaceId;
  price: number;
  mrp: number;
  /** Typical selling price over the last 90 days (drives the generated history). */
  typical: number;
  inStock?: boolean;
  deliveryDays: number;
  deliveryFee?: number;
  sellerName: string;
  sellerRating: number;
  returnDays: number;
  emiPerMonth?: number | null;
  bankOffers?: BankOffer[];
  exchangeUpTo?: number | null;
  scenario?: HistoryScenario;
}

export interface SampleProductSpec {
  product: Omit<Product, "image"> & { image?: string };
  offers: SampleOfferSpec[];
}

const hdfcCC = (discount: number): BankOffer => ({ bank: "HDFC Bank", cardType: "credit", description: `₹${discount} instant discount on HDFC Bank credit cards`, discount });
const iciciAny = (discount: number): BankOffer => ({ bank: "ICICI Bank", cardType: "any", description: `₹${discount} off with ICICI Bank cards`, discount });
const sbiCC = (discount: number): BankOffer => ({ bank: "SBI Card", cardType: "credit", description: `₹${discount} instant discount on SBI credit cards`, discount });
const axisAny = (discount: number): BankOffer => ({ bank: "Axis Bank", cardType: "any", description: `₹${discount} off with Axis Bank cards`, discount });
const flipkartAxis = (discount: number): BankOffer => ({ bank: "Flipkart Axis Bank", cardType: "credit", description: `₹${discount} cashback-equivalent on Flipkart Axis Bank credit card`, discount });
const amazonIcici = (discount: number): BankOffer => ({ bank: "Amazon Pay ICICI", cardType: "credit", description: `₹${discount} back on Amazon Pay ICICI credit card`, discount });

const p = (
  id: string,
  title: string,
  brand: string,
  category: CategoryId,
  specs: Record<string, string>,
  rating: number,
  ratingCount: number,
  keywords: string[],
): SampleProductSpec["product"] => ({ id, title, brand, category, specs, rating, ratingCount, keywords });

export const SAMPLE_PRODUCTS: SampleProductSpec[] = [
  {
    product: p("iphone-16-128gb", "Apple iPhone 16 (128 GB) - Black", "Apple", "smartphones",
      { Display: "6.1\" Super Retina XDR OLED", Processor: "A18", RAM: "8 GB", Storage: "128 GB", "Rear camera": "48 MP + 12 MP", Battery: "3561 mAh", "5G": "Yes", Warranty: "1 year Apple India" },
      4.6, 48210, ["iphone 16", "apple phone", "iphone"]),
    offers: [
      { marketplaceId: "amazon", price: 69900, mrp: 79900, typical: 71900, deliveryDays: 1, sellerName: "Appario Retail", sellerRating: 4.6, returnDays: 7, emiPerMonth: 3368, bankOffers: [hdfcCC(4000), amazonIcici(2097)], exchangeUpTo: 38000 },
      { marketplaceId: "flipkart", price: 68999, mrp: 79900, typical: 70999, deliveryDays: 2, sellerName: "SuperComNet", sellerRating: 4.5, returnDays: 7, emiPerMonth: 3325, bankOffers: [flipkartAxis(3450), hdfcCC(4000)], exchangeUpTo: 40000 },
      { marketplaceId: "croma", price: 71900, mrp: 79900, typical: 72900, deliveryDays: 2, sellerName: "Croma", sellerRating: 4.4, returnDays: 7, emiPerMonth: 3465, bankOffers: [hdfcCC(5000)], exchangeUpTo: 35000 },
      { marketplaceId: "reliance-digital", price: 72490, mrp: 79900, typical: 72490, deliveryDays: 3, sellerName: "Reliance Digital", sellerRating: 4.3, returnDays: 7, emiPerMonth: 3494, bankOffers: [sbiCC(3000)], exchangeUpTo: 33000 },
      { marketplaceId: "vijay-sales", price: 70990, mrp: 79900, typical: 72490, deliveryDays: 3, deliveryFee: 0, sellerName: "Vijay Sales", sellerRating: 4.2, returnDays: 7, emiPerMonth: 3421, bankOffers: [iciciAny(4000)] },
    ],
  },
  {
    product: p("samsung-galaxy-s25-256gb", "Samsung Galaxy S25 5G (12 GB / 256 GB) - Icyblue", "Samsung", "smartphones",
      { Display: "6.2\" Dynamic AMOLED 2X 120Hz", Processor: "Snapdragon 8 Elite for Galaxy", RAM: "12 GB", Storage: "256 GB", "Rear camera": "50 MP + 12 MP + 10 MP", Battery: "4000 mAh", "5G": "Yes", Warranty: "1 year Samsung India" },
      4.5, 21340, ["galaxy s25", "samsung s25", "samsung flagship"]),
    offers: [
      { marketplaceId: "amazon", price: 74999, mrp: 92999, typical: 76999, deliveryDays: 1, sellerName: "Darshita Etel", sellerRating: 4.5, returnDays: 7, emiPerMonth: 3614, bankOffers: [hdfcCC(5000)], exchangeUpTo: 42000 },
      { marketplaceId: "flipkart", price: 77999, mrp: 92999, typical: 77999, deliveryDays: 2, sellerName: "Flashtech Retail", sellerRating: 4.4, returnDays: 7, emiPerMonth: 3759, bankOffers: [flipkartAxis(3900)], exchangeUpTo: 45000, scenario: "pre-sale-hike" },
      { marketplaceId: "croma", price: 79999, mrp: 92999, typical: 79999, deliveryDays: 2, sellerName: "Croma", sellerRating: 4.4, returnDays: 7, emiPerMonth: 3855, bankOffers: [hdfcCC(6000)] },
      { marketplaceId: "reliance-digital", price: 76990, mrp: 92999, typical: 78990, deliveryDays: 3, sellerName: "Reliance Digital", sellerRating: 4.3, returnDays: 7, emiPerMonth: 3710, bankOffers: [sbiCC(4000)] },
    ],
  },
  {
    product: p("oneplus-nord-ce4-128gb", "OnePlus Nord CE4 5G (8 GB / 128 GB) - Celadon Marble", "OnePlus", "smartphones",
      { Display: "6.7\" AMOLED 120Hz", Processor: "Snapdragon 7 Gen 3", RAM: "8 GB", Storage: "128 GB", "Rear camera": "50 MP + 8 MP", Battery: "5500 mAh, 100W", "5G": "Yes", Warranty: "1 year" },
      4.3, 65400, ["nord ce4", "oneplus nord", "phone under 25000"]),
    offers: [
      { marketplaceId: "amazon", price: 22999, mrp: 26999, typical: 23999, deliveryDays: 1, sellerName: "Appario Retail", sellerRating: 4.6, returnDays: 7, emiPerMonth: 1108, bankOffers: [iciciAny(1500)], exchangeUpTo: 14000 },
      { marketplaceId: "flipkart", price: 23499, mrp: 26999, typical: 23499, deliveryDays: 2, sellerName: "RetailNet", sellerRating: 4.4, returnDays: 7, emiPerMonth: 1133, bankOffers: [flipkartAxis(1175)] },
      { marketplaceId: "croma", price: 23999, mrp: 26999, typical: 24499, deliveryDays: 3, sellerName: "Croma", sellerRating: 4.4, returnDays: 7, emiPerMonth: 1157, bankOffers: [] },
    ],
  },
  {
    product: p("redmi-note-14-pro-256gb", "Redmi Note 14 Pro 5G (8 GB / 256 GB) - Phantom Purple", "Xiaomi", "smartphones",
      { Display: "6.67\" AMOLED 120Hz", Processor: "MediaTek Dimensity 7300 Ultra", RAM: "8 GB", Storage: "256 GB", "Rear camera": "50 MP + 8 MP + 2 MP", Battery: "5110 mAh, 45W", "5G": "Yes", Warranty: "1 year" },
      4.2, 18760, ["redmi note 14 pro", "xiaomi", "phone under 25000"]),
    offers: [
      { marketplaceId: "amazon", price: 24999, mrp: 30999, typical: 25999, deliveryDays: 2, sellerName: "Clicktech Retail", sellerRating: 4.4, returnDays: 7, emiPerMonth: 1205, bankOffers: [hdfcCC(2000)], scenario: "steady-decline" },
      { marketplaceId: "flipkart", price: 24499, mrp: 30999, typical: 25499, deliveryDays: 2, sellerName: "XONIGHT E-Commerce", sellerRating: 4.2, returnDays: 7, emiPerMonth: 1181, bankOffers: [flipkartAxis(1225), iciciAny(2000)], scenario: "steady-decline" },
    ],
  },
  {
    product: p("macbook-air-m3-13-16gb", "Apple MacBook Air 13\" M3 (16 GB / 256 GB SSD) - Midnight", "Apple", "laptops",
      { Display: "13.6\" Liquid Retina", Processor: "Apple M3 (8-core CPU, 10-core GPU)", RAM: "16 GB", Storage: "256 GB SSD", Weight: "1.24 kg", "Battery life": "Up to 18 hours", OS: "macOS", Warranty: "1 year Apple India" },
      4.7, 9120, ["macbook air", "m3 laptop", "apple laptop", "laptop for students"]),
    offers: [
      { marketplaceId: "amazon", price: 99990, mrp: 114900, typical: 101990, deliveryDays: 1, sellerName: "Appario Retail", sellerRating: 4.6, returnDays: 10, emiPerMonth: 4819, bankOffers: [hdfcCC(10000)] },
      { marketplaceId: "flipkart", price: 98990, mrp: 114900, typical: 100990, deliveryDays: 3, sellerName: "Flashtech Retail", sellerRating: 4.4, returnDays: 7, emiPerMonth: 4771, bankOffers: [hdfcCC(10000), flipkartAxis(4950)] },
      { marketplaceId: "croma", price: 101990, mrp: 114900, typical: 102990, deliveryDays: 2, sellerName: "Croma", sellerRating: 4.4, returnDays: 7, emiPerMonth: 4915, bankOffers: [hdfcCC(10000)] },
      { marketplaceId: "vijay-sales", price: 100490, mrp: 114900, typical: 101490, deliveryDays: 4, sellerName: "Vijay Sales", sellerRating: 4.2, returnDays: 7, emiPerMonth: 4843, bankOffers: [iciciAny(8000)] },
    ],
  },
  {
    product: p("hp-victus-15-rtx4050", "HP Victus 15 Gaming Laptop (Ryzen 5 8645HS, RTX 4050, 16 GB, 512 GB SSD)", "HP", "laptops",
      { Display: "15.6\" FHD 144Hz", Processor: "AMD Ryzen 5 8645HS", RAM: "16 GB DDR5", Storage: "512 GB SSD", GPU: "NVIDIA RTX 4050 6 GB", Weight: "2.29 kg", OS: "Windows 11 Home", Warranty: "1 year HP" },
      4.2, 3870, ["gaming laptop", "hp victus", "rtx 4050 laptop"]),
    offers: [
      { marketplaceId: "amazon", price: 69990, mrp: 89999, typical: 72990, deliveryDays: 2, sellerName: "Clicktech Retail", sellerRating: 4.4, returnDays: 10, emiPerMonth: 3373, bankOffers: [sbiCC(5000)] },
      { marketplaceId: "flipkart", price: 67990, mrp: 89999, typical: 71990, deliveryDays: 3, sellerName: "HP World Store", sellerRating: 4.5, returnDays: 7, emiPerMonth: 3277, bankOffers: [hdfcCC(4000)], scenario: "steady-decline" },
      { marketplaceId: "reliance-digital", price: 71999, mrp: 89999, typical: 72999, deliveryDays: 4, sellerName: "Reliance Digital", sellerRating: 4.3, returnDays: 7, emiPerMonth: 3470, bankOffers: [] },
    ],
  },
  {
    product: p("sony-wh-1000xm5", "Sony WH-1000XM5 Wireless Noise Cancelling Headphones - Black", "Sony", "headphones",
      { Type: "Over-ear", ANC: "Yes (Auto NC Optimizer)", "Battery life": "30 hours", Charging: "USB-C, 3 min = 3 hours", Codec: "LDAC, AAC, SBC", Weight: "250 g", Warranty: "1 year Sony India" },
      4.5, 14230, ["sony xm5", "noise cancelling headphones", "anc headphones"]),
    offers: [
      { marketplaceId: "amazon", price: 21490, mrp: 34990, typical: 21990, deliveryDays: 6, deliveryFee: 99, sellerName: "GadgetBazaar Deals", sellerRating: 3.1, returnDays: 0, emiPerMonth: null, bankOffers: [] },
      { marketplaceId: "flipkart", price: 26990, mrp: 34990, typical: 27990, deliveryDays: 2, sellerName: "Sony Center Online", sellerRating: 4.6, returnDays: 7, emiPerMonth: 1301, bankOffers: [flipkartAxis(1350)] },
      { marketplaceId: "croma", price: 27990, mrp: 34990, typical: 28990, deliveryDays: 2, sellerName: "Croma", sellerRating: 4.4, returnDays: 7, emiPerMonth: 1349, bankOffers: [hdfcCC(1500)] },
      { marketplaceId: "reliance-digital", price: 27490, mrp: 34990, typical: 28490, deliveryDays: 3, sellerName: "Reliance Digital", sellerRating: 4.3, returnDays: 7, emiPerMonth: 1325, bankOffers: [sbiCC(1000)] },
    ],
  },
  {
    product: p("jbl-tune-770nc", "JBL Tune 770NC Adaptive Noise Cancelling Headphones - Blue", "JBL", "headphones",
      { Type: "Over-ear", ANC: "Adaptive", "Battery life": "70 hours (ANC off)", Charging: "USB-C", Codec: "SBC, AAC", Weight: "232 g", Warranty: "1 year" },
      4.2, 8890, ["jbl 770nc", "anc headphones under 10000"]),
    offers: [
      { marketplaceId: "amazon", price: 6999, mrp: 9999, typical: 7299, deliveryDays: 1, sellerName: "Appario Retail", sellerRating: 4.6, returnDays: 10, emiPerMonth: 337, bankOffers: [iciciAny(500)] },
      { marketplaceId: "flipkart", price: 7199, mrp: 9999, typical: 7299, deliveryDays: 2, sellerName: "JBL Official Store", sellerRating: 4.5, returnDays: 7, emiPerMonth: 347, bankOffers: [] },
      { marketplaceId: "croma", price: 6799, mrp: 9999, typical: 7499, inStock: false, deliveryDays: 3, sellerName: "Croma", sellerRating: 4.4, returnDays: 7, emiPerMonth: 328, bankOffers: [] },
    ],
  },
  {
    product: p("boat-airdopes-141", "boAt Airdopes 141 TWS Earbuds (42 h playback, ENx) - Bold Black", "boAt", "headphones",
      { Type: "In-ear TWS", ANC: "No (ENx call noise reduction)", "Battery life": "42 hours with case", Charging: "USB-C", "Water resistance": "IPX4", Warranty: "1 year" },
      4.0, 412000, ["boat earbuds", "airdopes 141", "earbuds under 1500"]),
    offers: [
      { marketplaceId: "amazon", price: 1099, mrp: 4490, typical: 1099, deliveryDays: 1, sellerName: "Imagine Marketing (boAt)", sellerRating: 4.3, returnDays: 7, emiPerMonth: null, bankOffers: [] },
      { marketplaceId: "flipkart", price: 1199, mrp: 4490, typical: 1249, deliveryDays: 2, sellerName: "boAt Store", sellerRating: 4.3, returnDays: 7, emiPerMonth: null, bankOffers: [] },
    ],
  },
  {
    product: p("lg-55-4k-ur7500", "LG 139 cm (55\") 4K Ultra HD Smart webOS LED TV 55UR7500", "LG", "televisions",
      { "Screen size": "55 inch", Resolution: "4K UHD (3840x2160)", Panel: "LED", "Refresh rate": "60 Hz", "Smart OS": "webOS", Audio: "20 W", Warranty: "1 year comprehensive + 1 year on panel" },
      4.3, 7650, ["lg 55 inch tv", "4k tv", "smart tv 55"]),
    offers: [
      { marketplaceId: "amazon", price: 42990, mrp: 69990, typical: 43990, deliveryDays: 3, sellerName: "Cloudtail India", sellerRating: 4.5, returnDays: 10, emiPerMonth: 2072, bankOffers: [hdfcCC(3000)] },
      { marketplaceId: "flipkart", price: 41990, mrp: 69990, typical: 43490, deliveryDays: 4, sellerName: "RetailNet", sellerRating: 4.4, returnDays: 7, emiPerMonth: 2024, bankOffers: [sbiCC(2500)] },
      { marketplaceId: "croma", price: 44990, mrp: 69990, typical: 44990, deliveryDays: 3, sellerName: "Croma", sellerRating: 4.4, returnDays: 7, emiPerMonth: 2168, bankOffers: [hdfcCC(4000)] },
      { marketplaceId: "vijay-sales", price: 43490, mrp: 69990, typical: 44490, deliveryDays: 5, sellerName: "Vijay Sales", sellerRating: 4.2, returnDays: 7, emiPerMonth: 2096, bankOffers: [axisAny(3000)] },
    ],
  },
  {
    product: p("samsung-galaxy-watch7-44mm", "Samsung Galaxy Watch7 Bluetooth (44 mm) - Green", "Samsung", "smartwatches",
      { Display: "1.5\" Super AMOLED", "Battery life": "Up to 40 hours", Health: "ECG, BP (calibrated), BIA, sleep apnea feature", "Water resistance": "5ATM + IP68", Compatibility: "Android only", Warranty: "1 year" },
      4.3, 5210, ["galaxy watch 7", "samsung watch", "android smartwatch"]),
    offers: [
      { marketplaceId: "amazon", price: 21999, mrp: 33999, typical: 22999, deliveryDays: 1, sellerName: "Darshita Etel", sellerRating: 4.5, returnDays: 7, emiPerMonth: 1060, bankOffers: [hdfcCC(2000)] },
      { marketplaceId: "flipkart", price: 22499, mrp: 33999, typical: 22999, deliveryDays: 2, sellerName: "Samsung Official", sellerRating: 4.6, returnDays: 7, emiPerMonth: 1085, bankOffers: [flipkartAxis(1125)] },
      { marketplaceId: "tata-cliq", price: 22990, mrp: 33999, typical: 23490, deliveryDays: 4, sellerName: "Tata CLiQ", sellerRating: 4.2, returnDays: 10, emiPerMonth: 1108, bankOffers: [iciciAny(1500)] },
    ],
  },
  {
    product: p("lg-1-5-ton-5-star-inverter-ac", "LG 1.5 Ton 5 Star DUAL Inverter Split AC (Copper, AI Convertible 6-in-1)", "LG", "appliances",
      { Capacity: "1.5 Ton", "Energy rating": "5 Star (BEE)", Compressor: "Dual inverter", Condenser: "Copper", "Annual energy": "~760 kWh (ISEER 5.3)", Warranty: "1 year product, 10 years compressor", Installation: "Free standard installation" },
      4.2, 11870, ["lg ac", "1.5 ton ac", "inverter ac", "5 star ac"]),
    offers: [
      { marketplaceId: "amazon", price: 46490, mrp: 78990, typical: 46990, deliveryDays: 4, sellerName: "Cloudtail India", sellerRating: 4.5, returnDays: 10, emiPerMonth: 2240, bankOffers: [hdfcCC(3500)], exchangeUpTo: 5000 },
      { marketplaceId: "flipkart", price: 45990, mrp: 78990, typical: 46490, deliveryDays: 5, sellerName: "OmniTechRetail", sellerRating: 4.3, returnDays: 10, emiPerMonth: 2216, bankOffers: [sbiCC(3000)], exchangeUpTo: 4500 },
      { marketplaceId: "croma", price: 47990, mrp: 78990, typical: 47990, deliveryDays: 3, sellerName: "Croma", sellerRating: 4.4, returnDays: 7, emiPerMonth: 2313, bankOffers: [hdfcCC(5000)] },
      { marketplaceId: "reliance-digital", price: 47490, mrp: 78990, typical: 47990, deliveryDays: 3, sellerName: "Reliance Digital", sellerRating: 4.3, returnDays: 7, emiPerMonth: 2289, bankOffers: [sbiCC(4000)] },
    ],
  },
  {
    product: p("levis-511-slim-jeans-32", "Levi's Men's 511 Slim Fit Jeans - Dark Indigo (Waist 32)", "Levi's", "fashion",
      { Fit: "Slim", Fabric: "Cotton blend with stretch", Rise: "Mid rise", Closure: "Zip fly", Care: "Machine wash cold", Size: "32" },
      4.3, 26400, ["levis jeans", "511 slim", "men jeans"]),
    offers: [
      { marketplaceId: "myntra", price: 1979, mrp: 3599, typical: 2159, deliveryDays: 3, sellerName: "Levi Strauss India", sellerRating: 4.5, returnDays: 14, bankOffers: [] },
      { marketplaceId: "ajio", price: 1889, mrp: 3599, typical: 2079, deliveryDays: 4, deliveryFee: 99, sellerName: "Levi's (Ajio)", sellerRating: 4.4, returnDays: 15, bankOffers: [] },
      { marketplaceId: "amazon", price: 2049, mrp: 3599, typical: 2199, deliveryDays: 2, sellerName: "Levi's Brand Store", sellerRating: 4.4, returnDays: 10, bankOffers: [] },
      { marketplaceId: "tata-cliq", price: 2159, mrp: 3599, typical: 2299, deliveryDays: 5, sellerName: "Tata CLiQ Fashion", sellerRating: 4.2, returnDays: 15, bankOffers: [] },
    ],
  },
  {
    product: p("minimalist-niacinamide-10-serum-30ml", "Minimalist 10% Niacinamide Face Serum with Zinc (30 ml)", "Minimalist", "beauty",
      { "Key ingredient": "10% Niacinamide + 1% Zinc", Size: "30 ml", "Skin type": "Oily, acne-prone, combination", Fragrance: "Fragrance free", "Shelf life": "Check pack" },
      4.2, 98200, ["niacinamide serum", "minimalist", "face serum"]),
    offers: [
      { marketplaceId: "nykaa", price: 569, mrp: 599, typical: 569, deliveryDays: 3, deliveryFee: 70, sellerName: "Nykaa", sellerRating: 4.5, returnDays: 0, bankOffers: [] },
      { marketplaceId: "amazon", price: 539, mrp: 599, typical: 559, deliveryDays: 1, sellerName: "Uprising Science (Minimalist)", sellerRating: 4.5, returnDays: 0, bankOffers: [] },
      { marketplaceId: "flipkart", price: 549, mrp: 599, typical: 559, deliveryDays: 3, deliveryFee: 40, sellerName: "Minimalist Official", sellerRating: 4.3, returnDays: 0, bankOffers: [] },
    ],
  },
];
