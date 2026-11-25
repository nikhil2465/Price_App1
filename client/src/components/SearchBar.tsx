import { Search } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

export function SearchBar({ initial = '', size = 'md', autoFocus = false }: { initial?: string; size?: 'md' | 'lg'; autoFocus?: boolean }) {
  const [q, setQ] = useState(initial);
  const navigate = useNavigate();
  useEffect(() => setQ(initial), [initial]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const term = q.trim().slice(0, 120);
    navigate(term ? `/search?q=${encodeURIComponent(term)}` : '/search');
  }

  const lg = size === 'lg';
  return (
    <form role="search" onSubmit={submit} className={`flex w-full items-center rounded-2xl bg-white ${lg ? 'p-2 shadow-lift' : 'border border-ink-300 p-1'}`}>
      <label htmlFor={`search-${size}`} className="sr-only">
        Search for a product
      </label>
      <Search className={`ml-3 shrink-0 text-ink-500 ${lg ? '' : 'hidden sm:block'}`} size={lg ? 22 : 18} aria-hidden="true" />
      <input
        id={`search-${size}`}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoFocus={autoFocus}
        maxLength={120}
        autoComplete="off"
        placeholder={lg ? 'Search phones, laptops, TVs, shoes…' : 'Search products'}
        className={`min-w-0 flex-1 bg-transparent px-3 outline-none placeholder:text-ink-500 ${lg ? 'py-3 text-lg' : 'py-1.5 text-sm'}`}
      />
      <button
        type="submit"
        className={`shrink-0 rounded-xl bg-brand-700 font-semibold text-white transition hover:bg-brand-800 ${lg ? 'px-6 py-3' : 'px-4 py-1.5 text-sm'}`}
      >
        {lg ? 'Compare prices' : 'Search'}
      </button>
    </form>
  );
}
