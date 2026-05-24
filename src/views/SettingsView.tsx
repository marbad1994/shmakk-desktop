import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Wrench,
  Server,
  Cpu,
  Palette,
  Keyboard,
  Info,
  Plus,
  Trash2,
  Mic,
  Volume2,
  Play,
  StopCircle,
} from "lucide-react";
import { useSettingsStore } from "../stores/settingsStore";
import { useVoiceStore } from "../stores/voiceStore";
import { Input } from "../components/Input";
import { Button } from "../components/Button";
import { Chip } from "../components/Chip";
import "./SettingsView.css";

const TABS = [
  { id: "general", label: "General", icon: Wrench },
  { id: "endpoints", label: "Endpoints", icon: Server },
  { id: "models", label: "Models", icon: Cpu },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "shortcuts", label: "Shortcuts", icon: Keyboard },
  { id: "voice", label: "Voice", icon: Mic },
  { id: "about", label: "About", icon: Info },
];

export function SettingsView() {
  const store = useSettingsStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get("tab") || "general";
  const [activeTab, setActiveTab] = useState(TABS.some((t) => t.id === tabFromUrl) ? tabFromUrl : "general");
  const [workspacePath, setWorkspacePath] = useState("");

  // Add endpoint modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newEpId, setNewEpId] = useState("");
  const [newEpName, setNewEpName] = useState("");
  const [newEpUrl, setNewEpUrl] = useState("");
  const [newEpKey, setNewEpKey] = useState("");

  useEffect(() => {
    window.api.workspace.getRoot().then(setWorkspacePath).catch(() => {});
  }, []);

  useEffect(() => {
    const next = searchParams.get("tab") || "general";
    if (TABS.some((t) => t.id === next)) setActiveTab(next);
  }, [searchParams]);

  const selectTab = (id: string) => {
    setActiveTab(id);
    setSearchParams(id === "general" ? {} : { tab: id }, { replace: true });
  };

  const handleBrowseWorkspace = async () => {
    const dir = await window.api.dialog.selectDirectory();
    if (dir) {
      setWorkspacePath(dir);
      await window.api.workspace.setRoot(dir);
    }
  };

  const handleWorkspaceBlur = async () => {
    if (workspacePath.trim()) {
      await window.api.workspace.setRoot(workspacePath.trim());
    }
  };

  const handleAddEndpoint = async () => {
    if (!newEpId.trim() || !newEpUrl.trim()) return;
    await store.addEndpoint(
      newEpId.trim(),
      newEpName.trim() || newEpId.trim(),
      newEpUrl.trim(),
      newEpKey.trim(),
    );
    setShowAddModal(false);
    setNewEpId("");
    setNewEpName("");
    setNewEpUrl("");
    setNewEpKey("");
  };

  const handleDeleteEndpoint = async (id: string) => {
    await store.deleteEndpoint(id);
  };

  const voice = useVoiceStore();

  return (
    <div className="settings">
      <div className="settings-tabs">
        {TABS.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <div
              key={tab.id}
              className={`settings-tab ${isActive ? "settings-tab-active" : ""}`}
              onClick={() => selectTab(tab.id)}
            >
              <span className="settings-tab-icon">
                <tab.icon size={16} strokeWidth={1.5} />
              </span>
              {tab.label}
            </div>
          );
        })}
      </div>

      <div className="settings-content">
        <div className="settings-header">
          <h2 className="settings-heading">
            {TABS.find((t) => t.id === activeTab)?.label}
          </h2>
          <span className="settings-header-sub mono">{activeTab}</span>
        </div>

        {activeTab === "general" && (
          <div className="settings-body">
            <div className="settings-section">
              <label className="settings-label">Workspace Root</label>
              <div className="settings-row">
                <Input
                  placeholder="/home/user/projects/shmakk-desktop"
                  value={workspacePath}
                  onChange={(e) => setWorkspacePath(e.target.value)}
                  onBlur={handleWorkspaceBlur}
                  className="settings-workspace-input"
                />
                <Button variant="ghost" size="sm" onClick={handleBrowseWorkspace}>
                  Browse
                </Button>
              </div>
            </div>

            <div className="settings-section">
              <label className="settings-label">Auto-save</label>
              <label className="settings-toggle">
                <input
                  type="checkbox"
                  checked={store.autoSave}
                  onChange={(e) => store.setAutoSave(e.target.checked)}
                />
                <span>Enable auto-save</span>
              </label>
            </div>

            <div className="settings-section">
              <label className="settings-label">Telemetry</label>
              <label className="settings-toggle">
                <input
                  type="checkbox"
                  checked={store.telemetry}
                  onChange={(e) => store.setTelemetry(e.target.checked)}
                />
                <span>Send anonymous usage data</span>
              </label>
            </div>
          </div>
        )}

        {activeTab === "endpoints" && (
          <div className="settings-body">
            <div className="settings-section">
              <div className="settings-section-header">
                <label className="settings-label">Configured Endpoints</label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAddModal(true)}
                >
                  <Plus size={12} /> Add
                </Button>
              </div>

              {store.endpoints.length === 0 ? (
                <p className="text-muted" style={{ padding: "12px 0" }}>
                  No endpoints configured. Add one to start chatting.
                </p>
              ) : (
                store.endpoints.map((ep) => (
                  <div key={ep.id} className="settings-endpoint-card">
                    <div className="settings-endpoint-main">
                      <span className="settings-endpoint-name">{ep.name}</span>
                      <span className="settings-endpoint-url mono">{ep.url}</span>
                      <Chip>{ep.type}</Chip>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteEndpoint(ep.id)}
                      className="settings-endpoint-remove"
                    >
                      <Trash2 size={12} />
                    </Button>
                  </div>
                ))
              )}

              {/* Add endpoint modal */}
              {showAddModal && (
                <div
                  className="settings-modal-overlay"
                  onClick={() => setShowAddModal(false)}
                >
                  <div
                    className="settings-modal"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <h3 className="settings-modal-title">Add Endpoint</h3>

                    <div className="settings-section">
                      <label className="settings-label">ID</label>
                      <Input
                        placeholder="e.g. openai, deepseek, local"
                        value={newEpId}
                        onChange={(e) => setNewEpId(e.target.value)}
                      />
                    </div>

                    <div className="settings-section">
                      <label className="settings-label">Display Name</label>
                      <Input
                        placeholder="My Provider"
                        value={newEpName}
                        onChange={(e) => setNewEpName(e.target.value)}
                      />
                    </div>

                    <div className="settings-section">
                      <label className="settings-label">Base URL</label>
                      <Input
                        placeholder="https://api.deepseek.com/v1"
                        value={newEpUrl}
                        onChange={(e) => setNewEpUrl(e.target.value)}
                      />
                    </div>

                    <div className="settings-section">
                      <label className="settings-label">API Key</label>
                      <Input
                        type="password"
                        placeholder="sk-..."
                        value={newEpKey}
                        onChange={(e) => setNewEpKey(e.target.value)}
                      />
                    </div>

                    <div className="settings-modal-actions">
                      <Button
                        variant="ghost"
                        onClick={() => setShowAddModal(false)}
                      >
                        Cancel
                      </Button>
                      <Button variant="primary" onClick={handleAddEndpoint}>
                        Add Endpoint
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Provider selection */}
              <div className="settings-section" style={{ marginTop: 20 }}>
                <label className="settings-label">Active Provider</label>
                <select
                  className="input settings-select"
                  value={store.providerId}
                  onChange={(e) =>
                    store.saveModel(e.target.value, store.model)
                  }
                >
                  {store.endpoints.map((ep) => (
                    <option key={ep.id} value={ep.id}>
                      {ep.name} ({ep.type})
                    </option>
                  ))}
                  {store.endpoints.length === 0 && (
                    <option value="">No endpoints</option>
                  )}
                </select>
              </div>

              <div className="settings-section">
                <label className="settings-label">API Key</label>
                <Input
                  type="password"
                  placeholder="(managed in endpoints.json)"
                  value={store.apiKey}
                  onChange={(e) => store.setApiKey(e.target.value)}
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === "models" && (
          <div className="settings-body">
            <div className="settings-section">
              <label className="settings-label">Active Provider</label>
              <select
                className="input settings-select"
                value={store.providerId}
                onChange={(e) =>
                  store.saveModel(e.target.value, store.model)
                }
              >
                {store.endpoints.map((ep) => (
                  <option key={ep.id} value={ep.id}>
                    {ep.name} ({ep.type})
                  </option>
                ))}
                {store.endpoints.length === 0 && (
                  <option value="">No endpoints</option>
                )}
              </select>
            </div>

            <div className="settings-section">
              <label className="settings-label">Model</label>
              <Input
                placeholder="e.g. deepseek-v4-pro, claude-sonnet-4-20250514"
                value={store.model}
                onChange={(e) => store.setModel(e.target.value)}
                onBlur={() => store.saveModel(store.providerId, store.model)}
              />
              <p className="text-muted" style={{ marginTop: 4, fontSize: 11 }}>
                Enter the model name as recognized by your provider's API.
              </p>
            </div>

            <div className="settings-section">
              <label className="settings-label">API Key</label>
              <Input
                type="password"
                placeholder="(managed in endpoints.json)"
                value={store.apiKey}
                onChange={(e) => store.setApiKey(e.target.value)}
              />
            </div>
          </div>
        )}

        {activeTab === "appearance" && (
          <div className="settings-body">
            <div className="settings-section">
              <label className="settings-label">Theme</label>
              <select
                className="input settings-select"
                value={store.theme}
                onChange={(e) =>
                  store.setTheme(e.target.value as "dark" | "light")
                }
              >
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </select>
            </div>

            <div className="settings-section">
              <label className="settings-label">
                Font Size ({store.fontSize}px)
              </label>
              <input
                type="range"
                min={11}
                max={18}
                value={store.fontSize}
                onChange={(e) => store.setFontSize(Number(e.target.value))}
                className="settings-slider"
              />
            </div>
          </div>
        )}

        {activeTab === "shortcuts" && (
          <div className="settings-body">
            <div className="settings-section">
              <label className="settings-label">Keyboard Shortcuts</label>
              <p className="text-muted" style={{ padding: "12px 0" }}>
                Keybindings can be configured in <code>~/.claude/keybindings.json</code>.
              </p>
            </div>
          </div>
        )}

        {activeTab === "voice" && (
          <div className="settings-body">
            <div className="settings-section">
              <label className="settings-label">Text-to-Speech</label>
              {!voice.ttsAvailable && (
                <p className="text-muted" style={{ marginBottom: 8 }}>
                  TTS engine not available. Run <code>npm run setup:voice</code> in
                  the shmakk directory.
                </p>
              )}
              <label className="settings-toggle">
                <input
                  type="checkbox"
                  checked={voice.ttsEnabled}
                  onChange={(e) => voice.setTtsEnabled(e.target.checked)}
                  disabled={!voice.ttsAvailable}
                />
                <span>Enable TTS</span>
              </label>
            </div>

            {voice.ttsEnabled && voice.ttsAvailable && (
              <>
                <div className="settings-section">
                  <label className="settings-label">TTS Voice</label>
                  <select
                    className="input settings-select"
                    value={voice.ttsVoice}
                    onChange={(e) => voice.setTtsVoice(e.target.value)}
                  >
                    <option value="af_heart">af_heart (default)</option>
                    <option value="af_bella">af_bella</option>
                    <option value="af_nicole">af_nicole</option>
                    <option value="af_sarah">af_sarah</option>
                    <option value="af_sky">af_sky</option>
                    <option value="am_adam">am_adam</option>
                    <option value="am_michael">am_michael</option>
                  </select>
                </div>

                <div className="settings-section">
                  <label className="settings-label">
                    Speed ({voice.ttsSpeed.toFixed(1)}x)
                  </label>
                  <input
                    type="range"
                    min={0.5}
                    max={3}
                    step={0.1}
                    value={voice.ttsSpeed}
                    onChange={(e) => voice.setTtsSpeed(Number(e.target.value))}
                    className="settings-slider"
                  />
                </div>

                <div className="settings-section">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      voice.speak("Hello, this is a TTS test from shmakk.");
                    }}
                  >
                    <Play size={12} /> Test TTS
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => voice.stopSpeaking()}
                    style={{ marginLeft: 8 }}
                  >
                    <StopCircle size={12} /> Stop
                  </Button>
                </div>
              </>
            )}

            <div className="settings-section" style={{ marginTop: 24 }}>
              <label className="settings-label">Speech-to-Text</label>
              {!voice.microphoneAvailable && (
                <p className="text-muted" style={{ marginBottom: 8 }}>
                  No microphone detected. Install sox:{" "}
                  <code>sudo pacman -S sox</code>
                </p>
              )}
              <label className="settings-toggle">
                <input
                  type="checkbox"
                  checked={voice.sttEnabled}
                  onChange={(e) => voice.setSttEnabled(e.target.checked)}
                  disabled={!voice.microphoneAvailable}
                />
                <span>Enable STT (voice input)</span>
              </label>
              {voice.recorder && (
                <p className="text-muted" style={{ marginTop: 4, fontSize: 11 }}>
                  Recorder: {voice.recorder}
                </p>
              )}
            </div>

            {voice.sttEnabled && (
              <div className="settings-section">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    const result = await window.api.voice.testMicrophone();
                    if (result.ok) {
                      voice.checkAvailability();
                    }
                  }}
                >
                  <Mic size={12} /> Test microphone
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => window.api.voice.preloadSTT()}
                  style={{ marginLeft: 8 }}
                >
                  <Volume2 size={12} /> Preload STT model
                </Button>
              </div>
            )}

            <div className="settings-section" style={{ marginTop: 24 }}>
              <label className="settings-label">Model Cache</label>
              <p className="text-muted" style={{ fontSize: 11 }}>
                Voice models are downloaded on first use and cached locally.
              </p>
            </div>
          </div>
        )}

        {activeTab === "about" && (
          <div className="settings-body">
            <div className="settings-section">
              <label className="settings-label">shmakk Desktop</label>
              <p className="text-muted" style={{ marginTop: 8 }}>Version 0.1.0</p>
              <p className="text-muted" style={{ marginTop: 4 }}>
                AI-powered development workspace. Built with Electron, React, and TypeScript.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
