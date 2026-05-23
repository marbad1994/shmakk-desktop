import { Search, X } from "lucide-react";
import "./SearchInput.css";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Search...",
  className = "",
}: SearchInputProps) {
  return (
    <div className={`search-input ${className}`}>
      <Search size={14} strokeWidth={1.5} className="search-input-icon" />
      <input
        className="search-input-field"
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button
          className="search-input-clear"
          onClick={() => onChange("")}
          type="button"
          aria-label="Clear search"
        >
          <X size={12} strokeWidth={2} />
        </button>
      )}
    </div>
  );
}
