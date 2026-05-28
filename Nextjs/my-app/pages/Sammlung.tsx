import { useState } from "react";

// =====================================================================
// 1. DATEN FÜR DIE TIERARTEN
// =====================================================================

const ANIMAL_DATA = [
  { id: 1, name: "Apollofalter", sciName: "Parnassius apollo", category: "Insekten", location: "Siegen, NRW", status: "Selten", statusStyle: "selten", imgSrc: "/apollofalter.jpg" },
  { id: 2, name: "Erdkröte", sciName: "Bufo bufo", category: "Amphibien", location: "Siegen, NRW", status: "Häufig", statusStyle: "haeufig", imgSrc: "/erdkroete.jpg" },
  { id: 3, name: "Europäischer Igel", sciName: "Erinaceus europaeus", category: "Säugetiere", location: "Siegen, NRW", status: "Häufig", statusStyle: "haeufig", imgSrc: "/igel.jpg" },
  { id: 4, name: "Grasfrosch", sciName: "Rana temporaria", category: "Amphibien", location: "Siegen, NRW", status: "Häufig", statusStyle: "haeufig", imgSrc: "/grasfrosch.jpg" },
  { id: 5, name: "Rotfuchs", sciName: "Vulpes vulpes", category: "Säugetiere", location: "Siegen, NRW", status: "Häufig", statusStyle: "haeufig", imgSrc: "/fuchs.jpg" },
  { id: 6, name: "Honigbiene", sciName: "Apis mellifera", category: "Insekten", location: "Siegen, NRW", status: "Wichtig", statusStyle: "wichtig", imgSrc: "/biene.jpg" },
  { id: 7, name: "Waldkauz", sciName: "Strix aluco", category: "Vögel", location: "Siegen, NRW", status: "Selten", statusStyle: "selten", imgSrc: "/waldkauz.jpg" },
  { id: 8, name: "Feuersalamander", sciName: "Salamandra salamandra", category: "Amphibien", location: "Siegen, NRW", status: "Geschützt", statusStyle: "geschuetzt", imgSrc: "/feuersalamander.jpg" },
];

// =====================================================================
// 2. DIE HAUPT-KOMPONENTE
// =====================================================================

export default function TaxonomenPage() {
  const [searchTerm, setSearchTerm] = useState("");

  const filteredAnimals = ANIMAL_DATA.filter((animal) =>
    animal.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    animal.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        body {
          background: #f8f9fa; 
          min-height: 100vh;
          font-family: 'Inter', system-ui, sans-serif;
          color: #202124;
        }

        .app-layout {
          display: flex;
          min-height: 100vh;
          padding: 24px;
          gap: 24px;
        }

        /* Sidebar */
        .sidebar {
          width: 88px;
          border-radius: 12px;
          background: linear-gradient(180deg, #0f3d2e, #1b5e20);
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 24px 0;
          box-shadow: 0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24);
          flex-shrink: 0;
        }

        .sidebar-icon {
          margin-bottom: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .nav-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
          width: 100%;
          align-items: center;
        }

        .nav-btn {
          width: 48px;
          height: 48px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          color: rgba(255,255,255,0.7);
          transition: background 0.2s, color 0.2s;
        }

        .nav-btn:hover {
          background: rgba(255,255,255,0.1);
        }

        .nav-btn.active {
          background-color: #e8f5e9;
        }

        .profile-btn {
          margin-top: auto;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: #2e7d32;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 2px solid rgba(255,255,255,0.2);
          cursor: pointer;
          transition: background 0.2s;
        }
        
        .profile-btn:hover {
          background: #1b5e20;
        }

        /* Main Content Area */
        .main-content {
          flex: 1;
          background: #ffffff;
          border: 1px solid #dadce0;
          border-radius: 12px;
          padding: 40px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.12);
          display: flex;
          flex-direction: column;
        }

        .header {
          margin-bottom: 32px;
        }

        .breadcrumbs {
          font-size: 12px;
          font-weight: 500;
          color: #70757a;
          letter-spacing: 0.5px;
          text-transform: uppercase;
          margin-bottom: 8px;
        }

        .page-title {
          font-size: 28px;
          font-weight: 500;
          color: #202124;
          letter-spacing: -0.02em;
        }

        /* Toolbar */
        .toolbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 32px;
        }

        .search-wrap {
          position: relative;
          width: min(400px, 100%);
        }

        .search-icon {
          position: absolute;
          left: 14px;
          top: 50%;
          transform: translateY(-50%);
          font-size: 16px;
          color: #70757a;
          pointer-events: none;
        }

        .search-input {
          width: 100%;
          background: #ffffff;
          border: 1px solid #dadce0;
          border-radius: 6px;
          padding: 12px 15px 12px 40px;
          font-family: inherit;
          font-size: 14px;
          color: #202124;
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
        }

        .search-input:focus {
          border-color: #1a73e8;
          box-shadow: 0 0 0 1px #1a73e8;
        }

        .search-input::placeholder {
          color: #70757a;
        }

        .filter-btn {
          height: 44px;
          padding: 0 16px;
          background: #ffffff;
          border: 1px solid #dadce0;
          border-radius: 6px;
          color: #5f6368;
          font-family: inherit;
          font-weight: 500;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          transition: background 0.2s;
        }

        .filter-btn:hover {
          background: #f8f9fa;
        }

        /* Grid & Cards */
        .animal-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
          gap: 20px;
          margin-bottom: 40px;
        }

        .animal-card {
          border: 1px solid #dadce0;
          border-radius: 8px;
          padding: 12px;
          background: #ffffff;
          transition: box-shadow 0.2s ease, transform 0.2s ease;
          display: flex;
          flex-direction: column;
        }

        .animal-card:hover {
          box-shadow: 0 4px 12px rgba(0,0,0,0.08);
          transform: translateY(-2px);
        }

        .image-container {
          width: 100%;
          height: 140px;
          border-radius: 6px;
          background-color: #f1f3f4;
          overflow: hidden;
          margin-bottom: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        /* WICHTIG: Neues Styling für die Tierfotos */
        .image-container img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .card-title {
          font-size: 16px;
          font-weight: 500;
          color: #202124;
          margin-bottom: 2px;
        }

        .card-subtitle {
          font-size: 13px;
          color: #5f6368;
          font-style: italic;
          margin-bottom: 8px;
        }

        .card-detail {
          font-size: 13px;
          color: #5f6368;
          margin-bottom: 4px;
        }

        .badge-wrap {
          margin-top: 12px;
        }

        .status-badge {
          display: inline-block;
          font-size: 12px;
          font-weight: 500;
          padding: 4px 8px;
          border-radius: 4px;
        }

        .badge-selten { background: #e8f5e9; color: #137333; }
        .badge-haeufig { background: #e8f5e9; color: #137333; }
        .badge-wichtig { background: #fef7e0; color: #b06000; }
        .badge-geschuetzt { background: #fce8e6; color: #c5221f; }

        /* Pagination */
        .pagination {
          margin-top: auto;
          display: flex;
          justify-content: center;
          gap: 8px;
        }

        .page-item {
          width: 32px;
          height: 32px;
          border-radius: 4px;
          border: 1px solid transparent;
          background: transparent;
          color: #5f6368;
          font-family: inherit;
          font-weight: 500;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.2s;
        }

        .page-item:hover {
          background: #f1f3f4;
        }

        .page-item.active {
          background: #1a73e8;
          color: #ffffff;
        }

        .empty-state {
          grid-column: 1 / -1;
          text-align: center;
          padding: 48px;
          color: #70757a;
          border: 1px dashed #dadce0;
          border-radius: 8px;
        }
      `}</style>

      <div className="app-layout">
        
        {/* === SIDEBAR === */}
        <aside className="sidebar">
        <div className="sidebar-icon">
          {/* Logo: widow.svg existiert nicht – entweder Datei hinzufügen oder weglassen */}
          <img src="/blatt.svg" alt="Logo" width={32} height={32}
            onError={(e) => e.currentTarget.style.display = 'none'} />
        </div>
        
        <nav className="nav-list">
          <div className="nav-btn">
            <img src="/ordner.svg" alt="Ordner" width={24} height={24}
              onError={(e) => e.currentTarget.style.display = 'none'} />
          </div>
          
          <div className="nav-btn">
            <img src="/karte.svg" alt="Karte" width={24} height={24}
              onError={(e) => e.currentTarget.style.display = 'none'} />
          </div>
          
          <div className="nav-btn active">
            <img src="/dokument.svg" alt="Dokument" width={24} height={24}
              onError={(e) => e.currentTarget.style.display = 'none'} />
          </div>
          
          <div className="nav-btn">
            <img src="/Zahnrad.svg" alt="Einstellungen" width={24} height={24}
              onError={(e) => e.currentTarget.style.display = 'none'} />
          </div>
        </nav>

        <div className="profile-btn">
          <img src="/mensch.svg" alt="Profil" width={20} height={20}
            onError={(e) => e.currentTarget.style.display = 'none'} />
        </div>
      </aside>

        {/* === MAIN CONTENT === */}
        <main className="main-content">
          <header className="header">
            <div className="breadcrumbs">Taxonomen / Tierarten Übersicht</div>
            <h1 className="page-title">Tierarten</h1>
          </header>

          <div className="toolbar">
            <div className="search-wrap">
              <span className="search-icon">🔍</span>
              <input 
                type="text" 
                className="search-input" 
                placeholder="Suche nach Tierarten..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <button className="filter-btn">
              <span>≡</span> Filter
            </button>
          </div>

          <div className="animal-grid">
            {filteredAnimals.length > 0 ? (
              filteredAnimals.map((animal) => (
                <div key={animal.id} className="animal-card">
                  
                  {/* Tier Bild */}
                  <div className="image-container">
                    <img 
                      src={animal.imgSrc} 
                      alt={animal.name} 
                      onError={(e) => {
                        // Versteckt das Bild, falls die JPG-Datei noch nicht im public-Ordner liegt
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  </div>
                  
                  <h3 className="card-title">{animal.name}</h3>
                  <div className="card-subtitle">{animal.sciName}</div>
                  <div className="card-detail">{animal.category}</div>
                  <div className="card-detail">{animal.location}</div>
                  
                  <div className="badge-wrap">
                    <span className={`status-badge badge-${animal.statusStyle}`}>
                      {animal.status}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-state">
                Keine Tierarten für "{searchTerm}" gefunden.
              </div>
            )}
          </div>

          <div className="pagination">
            <button className="page-item active">1</button>
            <button className="page-item">2</button>
            <button className="page-item">3</button>
          </div>
        </main>

      </div>
    </>
  );
}
