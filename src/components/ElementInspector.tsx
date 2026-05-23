import { useState } from "react";
import { X, Trash2, MessageSquare, Check, Code, Layers, Save } from "lucide-react";
import { Button } from "./Button";
import "./ElementInspector.css";

export interface ElementInfo {
  selector: string;
  tag: string;
  id: string;
  classes: string[];
  text: string;
  styles: Record<string, string>;
}

interface ElementInspectorProps {
  element: ElementInfo;
  onApplyEdit: (style: Record<string, string>, text: string | undefined, target: "inline" | "class") => void;
  onSave: (style: Record<string, string>, text: string | undefined, target: "inline" | "class") => void;
  onDelete: () => void;
  onAskAI: (prompt: string) => void;
  onClose: () => void;
  onCancelAll?: () => void;
  onSaveAll?: () => void;
  savedCount?: number;
  initialEdits?: { style: Record<string, string>; text?: string; target: "inline" | "class" };
}

interface EditEntry { property: string; value: string; }

// Extract color values from any CSS value string
function extractColors(value: string): string[] {
  const colors: string[] = [];
  // hex: #rgb, #rrggbb, #rrggbbaa
  const hexRe = /#[0-9a-fA-F]{3,8}\b/g;
  let m;
  while ((m = hexRe.exec(value)) !== null) colors.push(m[0]);
  // rgb/rgba
  const rgbRe = /rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*[\d.]+)?\s*\)/gi;
  while ((m = rgbRe.exec(value)) !== null) colors.push(m[0]);
  // hsl/hsla
  const hslRe = /hsla?\(\s*\d{1,3}\s*,\s*\d{1,3}%\s*,\s*\d{1,3}%(?:\s*,\s*[\d.]+)?\s*\)/gi;
  while ((m = hslRe.exec(value)) !== null) colors.push(m[0]);
  // named colors
  const namedRe = /\b(transparent|currentColor|inherit)\b/gi;
  while ((m = namedRe.exec(value)) !== null) colors.push(m[0]);
  return colors;
}

function rgbToHex(rgb: string): string {
  const m = /rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/.exec(rgb);
  if (!m) return rgb;
  const toHex = (n: string) => parseInt(n).toString(16).padStart(2, "0");
  return `#${toHex(m[1])}${toHex(m[2])}${toHex(m[3])}`;
}

function replaceColorInValue(value: string, oldColor: string, newColor: string): string {
  return value.replace(oldColor, newColor);
}

export function ElementInspector({ element, onApplyEdit, onSave, onDelete, onAskAI, onClose, onCancelAll, onSaveAll, savedCount, initialEdits }: ElementInspectorProps) {
  const [edits, setEdits] = useState<EditEntry[]>(
    initialEdits?.style ? Object.entries(initialEdits.style).map(([k, v]) => ({ property: k, value: v })) : []
  );
  const [textEdit, setTextEdit] = useState(initialEdits?.text || element.text || "");
  const [newProp, setNewProp] = useState("");
  const [newVal, setNewVal] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [showAiPrompt, setShowAiPrompt] = useState(false);
  const [target, setTarget] = useState<"inline" | "class">(initialEdits?.target || "inline");
  const [lastApplied, setLastApplied] = useState<{ style: Record<string, string>; text: string | undefined; target: "inline" | "class" } | null>(
    initialEdits ? { style: initialEdits.style, text: initialEdits.text, target: initialEdits.target } : null
  );

  const editCount = edits.length + (textEdit !== (element.text || "") ? 1 : 0);

  const handleApply = () => {
    const style: Record<string, string> = {};
    for (const e of edits) style[e.property] = e.value;
    const text = textEdit !== (element.text || "") ? textEdit : undefined;
    onApplyEdit(style, text, target);
    setLastApplied({ style, text, target });
    setEdits([]);
  };

  const handleSave = () => {
    if (!lastApplied) return;
    onSave(lastApplied.style, lastApplied.text, lastApplied.target);
    setLastApplied(null);
  };

  const handleAddEdit = (property: string, value: string) => {
    if (!property || value === undefined) return;
    setEdits((prev) => {
      const ex = prev.findIndex((e) => e.property === property);
      if (ex >= 0) { const n = [...prev]; n[ex] = { property, value }; return n; }
      return [...prev, { property, value }];
    });
  };

  const handleColorChange = (property: string, value: string, oldColor: string, newColor: string) => {
    const newVal = replaceColorInValue(value, oldColor, newColor);
    handleAddEdit(property, newVal);
  };

  const handleRemoveEdit = (property: string) => {
    setEdits((prev) => prev.filter((e) => e.property !== property));
  };

  const handleAddCustom = () => {
    if (!newProp.trim()) return;
    handleAddEdit(newProp.trim(), newVal.trim());
    setNewProp(""); setNewVal("");
  };

  const styleEntries = Object.entries(element.styles)
    .filter(([, v]) => v && v !== "none" && v !== "normal" && v !== "auto")
    .filter(([, v]) => !/^(0px|0s|0ms|0%|0 0 0 0)$/.test(v.trim()));

  return (
    <div className="elem-inspector">
      <div className="elem-inspector-header">
        <div>
          <span className="elem-tag mono">&lt;{element.tag}{element.id ? ` #${element.id}` : ""}{element.classes.length > 0 ? ` .${element.classes.join(".")}` : ""}&gt;</span>
          <span className="elem-selector mono">{element.selector}</span>
        </div>
        <button className="elem-close-btn" onClick={onClose} type="button"><X size={14} strokeWidth={1.5} /></button>
      </div>

      {/* Target selector: inline vs class */}
      {element.classes.length > 0 && (
        <div className="elem-section" style={{ paddingBottom: 0 }}>
          <label>Apply edits to</label>
          <div className="elem-target-row">
            <button className={`elem-target-btn ${target==="inline"?"active":""}`} onClick={()=>setTarget("inline")} type="button">
              <Code size={11} /> Inline style
            </button>
            <button className={`elem-target-btn ${target==="class"?"active":""}`} onClick={()=>setTarget("class")} type="button">
              <Layers size={11} /> Class: .{element.classes[0]}
            </button>
          </div>
        </div>
      )}

      {element.text && (
        <div className="elem-section">
          <label>Text content</label>
          <input type="text" value={textEdit} onChange={(e) => setTextEdit(e.target.value)} className="elem-input" />
        </div>
      )}

      <div className="elem-section">
        <label>Styles ({styleEntries.length} properties)</label>
        <div className="elem-style-list">
          {styleEntries.map(([prop, val]) => {
            const edited = edits.find((e) => e.property === prop);
            const displayVal = edited ? edited.value : val;
            const changed = edited && edited.value !== val;
            const colors = extractColors(displayVal);

            return (
              <div key={prop} className={`elem-style-row ${changed ? "elem-style-changed" : ""}`}>
                <span className="elem-style-prop mono">{prop}</span>
                <div className="elem-style-val-col">
                  <div className="elem-style-val-wrap">
                    <input type="text" value={displayVal}
                      onChange={(e) => handleAddEdit(prop, e.target.value)}
                      className="elem-input elem-input-sm mono" />
                    {changed && (
                      <button className="elem-undo-btn" onClick={() => handleRemoveEdit(prop)} type="button">
                        <X size={10} strokeWidth={1.5} />
                      </button>
                    )}
                  </div>
                  {/* Color wheels for every color found in the value */}
                  {colors.length > 0 && (
                    <div className="elem-color-row">
                      {colors.map((c, i) => (
                        <div key={i} className="elem-color-chip-group">
                          <input type="color"
                            value={/^#/.test(c) ? c : rgbToHex(c)}
                            onChange={(e) => handleColorChange(prop, displayVal, c, e.target.value)}
                            className="elem-color-picker" />
                          <span className="elem-color-value mono">{c}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="elem-add-row">
          <input type="text" placeholder="property" value={newProp} onChange={(e) => setNewProp(e.target.value)} className="elem-input elem-input-sm mono" style={{ flex: 1 }} />
          <input type="text" placeholder="value" value={newVal} onChange={(e) => setNewVal(e.target.value)} className="elem-input elem-input-sm mono" style={{ flex: 1 }} />
          <button className="elem-add-btn" onClick={handleAddCustom} type="button">+ Add</button>
        </div>
      </div>

      {showAiPrompt && (
        <div className="elem-section">
          <label>Ask AI to modify this element</label>
          <textarea className="elem-textarea" placeholder={`Make this ${element.tag} larger, add hover animation...`}
            value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} rows={2} />
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            <Button variant="primary" size="sm" onClick={() => {
              onAskAI(`[Element: <${element.tag}> ${element.selector}] ${aiPrompt}`);
            }}><MessageSquare size={12} /> Ask AI</Button>
            <Button variant="ghost" size="sm" onClick={() => setShowAiPrompt(false)}>Cancel</Button>
          </div>
        </div>
      )}

      <div className="elem-actions">
        <Button variant="primary" size="sm" onClick={handleApply} disabled={editCount === 0}>
          <Check size={12} /> Apply ({editCount})
        </Button>
        {lastApplied && (
          <Button variant="primary" size="sm" onClick={handleSave}>
            <Save size={12} /> Save to {target === "class" ? "class" : "source"}
          </Button>
        )}
        {!showAiPrompt && (
          <Button variant="ghost" size="sm" onClick={() => setShowAiPrompt(true)}>
            <MessageSquare size={12} /> Ask AI...
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onDelete}><Trash2 size={12} /> Delete</Button>
      </div>
      {(onSaveAll || onCancelAll) && (
        <div className="elem-actions elem-actions-footer">
          {onCancelAll && (
            <Button variant="ghost" size="sm" onClick={onCancelAll}>Cancel</Button>
          )}
          <div className="grow" />
          {onSaveAll && (
            <Button variant="primary" size="sm" onClick={onSaveAll}>
              <Save size={12} /> Save changes{(savedCount || 0) > 0 ? ` (${savedCount})` : ""}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
