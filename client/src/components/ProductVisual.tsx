import { Headphones, Laptop, Shirt, Smartphone, Sparkles, Tv, WashingMachine, Watch, type LucideIcon } from 'lucide-react';
import type { CategoryId } from '@shared/types';

export const CATEGORY_ICON: Record<CategoryId, LucideIcon> = {
  smartphones: Smartphone,
  laptops: Laptop,
  headphones: Headphones,
  televisions: Tv,
  smartwatches: Watch,
  appliances: WashingMachine,
  fashion: Shirt,
  beauty: Sparkles,
};

const GRADIENT: Record<CategoryId, string> = {
  smartphones: 'from-sky-100 to-indigo-100 text-indigo-700',
  laptops: 'from-slate-100 to-blue-100 text-blue-800',
  headphones: 'from-violet-100 to-fuchsia-100 text-violet-700',
  televisions: 'from-cyan-100 to-sky-100 text-sky-800',
  smartwatches: 'from-emerald-100 to-teal-100 text-teal-700',
  appliances: 'from-amber-50 to-orange-100 text-orange-700',
  fashion: 'from-rose-100 to-pink-100 text-rose-700',
  beauty: 'from-pink-50 to-purple-100 text-purple-700',
};

/** Product images aren't available for sample data, so each product gets a consistent category illustration. */
export function ProductVisual({
  category,
  brand,
  image,
  size = 'md',
}: {
  category: CategoryId;
  brand: string;
  image?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const Icon = CATEGORY_ICON[category];
  const dims = size === 'lg' ? 'h-56 w-full' : size === 'sm' ? 'h-14 w-14' : 'h-32 w-32';
  const icon = size === 'lg' ? 72 : size === 'sm' ? 24 : 44;
  if (image) {
    return <img src={image} alt="" loading="lazy" className={`${dims} rounded-2xl bg-white object-contain`} />;
  }
  return (
    <div
      aria-hidden="true"
      className={`${dims} relative flex shrink-0 flex-col items-center justify-center rounded-2xl bg-gradient-to-br ${GRADIENT[category]}`}
    >
      <Icon size={icon} strokeWidth={1.5} />
      {size !== 'sm' && <span className="mt-2 text-xs font-semibold uppercase tracking-wider opacity-70">{brand}</span>}
    </div>
  );
}
