import Navbar from "./Navbar";

export default function PageWrapper({ children, title, description, actions }) {
  return (
    <div className="min-h-screen">
      <Navbar />

      <main className="pb-24 pt-20 md:pb-8 md:pl-64">
        <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8">
          {(title || description || actions) && (
            <div className="mb-8 flex flex-col gap-4 border-b border-slate-200 pb-6 lg:flex-row lg:items-end lg:justify-between">
              <div>
                {title && <h1 className="page-title">{title}</h1>}
                {description && <p className="page-subtitle">{description}</p>}
              </div>

              {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
            </div>
          )}

          {children}
        </div>
      </main>
    </div>
  );
}
