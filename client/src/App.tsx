import { Route, Routes } from 'react-router-dom';
import { AssistantWidget } from './components/AssistantWidget';
import { CompareTray } from './components/CompareTray';
import { Footer, Header } from './components/Header';
import { SampleDataBanner } from './components/SampleDataBanner';
import { EmptyState } from './components/States';
import { ComparePage } from './pages/ComparePage';
import { HomePage } from './pages/HomePage';
import { ProductPage } from './pages/ProductPage';
import { SearchPage } from './pages/SearchPage';

export function App() {
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2">
        Skip to content
      </a>
      <SampleDataBanner />
      <Header />
      <main id="main" className="flex-1 pb-24">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/product/:id" element={<ProductPage />} />
          <Route path="/compare" element={<ComparePage />} />
          <Route
            path="*"
            element={
              <div className="mx-auto max-w-3xl px-4 py-16">
                <EmptyState title="Page not found">That link doesn’t go anywhere.</EmptyState>
              </div>
            }
          />
        </Routes>
      </main>
      <Footer />
      <CompareTray />
      <AssistantWidget />
    </div>
  );
}
