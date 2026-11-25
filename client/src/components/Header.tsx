import { TrendingDown } from 'lucide-react';
import { Link, NavLink, useLocation, useSearchParams } from 'react-router-dom';
import { SearchBar } from './SearchBar';

const NAV = [
  { to: '/search?category=smartphones', label: 'Phones' },
  { to: '/search?category=laptops', label: 'Laptops' },
  { to: '/search?category=televisions', label: 'TVs' },
  { to: '/search?category=headphones', label: 'Audio' },
  { to: '/search?category=appliances', label: 'Appliances' },
  { to: '/search?category=fashion', label: 'Fashion' },
];

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2" aria-label="PriceWise home">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-800 text-deal-500">
        <TrendingDown size={20} strokeWidth={2.5} aria-hidden="true" />
      </span>
      <span className="text-xl font-extrabold tracking-tight text-brand-900">
        Price<span className="text-deal-600">Wise</span>
      </span>
    </Link>
  );
}

export function Header() {
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const showSearch = pathname !== '/';
  return (
    <header className="sticky top-0 z-30 border-b border-ink-100 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
        <Logo />
        {showSearch && (
          <div className="mx-auto hidden w-full max-w-xl md:block">
            <SearchBar initial={params.get('q') ?? ''} />
          </div>
        )}
        <nav aria-label="Categories" className={`ml-auto hidden items-center gap-1 lg:flex ${showSearch ? 'xl:flex' : ''}`}>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} className="rounded-lg px-3 py-2 text-sm font-medium text-ink-700 hover:bg-brand-50 hover:text-brand-700">
              {n.label}
            </NavLink>
          ))}
        </nav>
      </div>
      {showSearch && (
        <div className="px-4 pb-3 md:hidden">
          <SearchBar initial={params.get('q') ?? ''} />
        </div>
      )}
    </header>
  );
}

export function Footer() {
  return (
    <footer className="mt-16 border-t border-ink-100 bg-white">
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-10 text-sm text-ink-500 md:grid-cols-3">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs">Compare the real price you pay across Indian stores, after bank offers and delivery.</p>
        </div>
        <div>
          <p className="font-semibold text-ink-900">How we rank</p>
          <p className="mt-2">
            Effective price = selling price + delivery − the best single bank offer. Deal score blends price (60%), delivery speed (15%), seller rating
            (15%) and return window (10%). Stores never pay for ranking.
          </p>
        </div>
        <div>
          <p className="font-semibold text-ink-900">Disclosure</p>
          <p className="mt-2">
            Some links may be affiliate links; that never changes the order of results. Prices change often, so always confirm the final price on the
            store before you pay.
          </p>
        </div>
      </div>
    </footer>
  );
}
