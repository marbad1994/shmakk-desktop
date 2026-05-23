import "./SegmentedControl.css";

export interface Segment {
  value: string;
  label: string;
  badge?: number;
}

interface SegmentedControlProps {
  segments: Segment[];
  value: string;
  onChange: (value: string) => void;
}

export function SegmentedControl({ segments, value, onChange }: SegmentedControlProps) {
  return (
    <div className="segmented">
      {segments.map((seg) => (
        <button
          key={seg.value}
          className={`segmented-item${seg.value === value ? " active" : ""}`}
          onClick={() => onChange(seg.value)}
          type="button"
        >
          {seg.label}
          {seg.badge !== undefined && (
            <span className="segmented-badge">{seg.badge}</span>
          )}
        </button>
      ))}
    </div>
  );
}
