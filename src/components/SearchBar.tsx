import { useEffect, useState } from "react";
import { Search, Folder, File } from "lucide-react";
import { useVaultStore, type SearchResult } from "../store/vaultStore";

interface SearchBarProps {
  onSelectFile: (fileId: string) => void;
  onSelectFolder: (fileId: string) => void;
}

export function SearchBar({ onSelectFile, onSelectFolder }: SearchBarProps) {
  const searchVault = useVaultStore((s) => s.searchVault);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      searchVault(q).then((r) => {
        if (!cancelled) setResults(r);
      });
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, searchVault]);

  function handleClick(result: SearchResult) {
    if (result.type === "file") onSelectFile(result.fileId);
    else onSelectFolder(result.fileId);
    setQuery("");
  }

  const active = query.trim().length > 0;

  return (
    <div className="search-bar">
      <div className="search-input-wrap">
        <Search size={17} />
        <input
          type="text"
          className="search-input"
          placeholder="Search files…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {active && (
        <div className="search-results">
          {results.length === 0 ? (
            <p className="placeholder-text search-empty">No matches.</p>
          ) : (
            results.map((r) => (
              <div key={r.fileId} className="search-result-item" onClick={() => handleClick(r)}>
                <span className="search-result-icon">
                  {r.type === "folder" ? <Folder size={17} /> : <File size={17} />}
                </span>
                <div className="search-result-text">
                  <div className="search-result-name">{r.fileName}</div>
                  {r.snippet && <div className="search-result-snippet">"{r.snippet}"</div>}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
