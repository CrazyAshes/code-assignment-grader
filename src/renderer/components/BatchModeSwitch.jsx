function BatchModeSwitch({ mode, onChange }) {
  return (
    <div className="mode-switch" role="tablist" aria-label="Grading mode">
      <button
        type="button"
        role="tab"
        aria-selected={mode === "single"}
        className={`mode-switch-button ${mode === "single" ? "active" : ""}`}
        onClick={() => onChange("single")}
      >
        Single Grade
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === "batch"}
        className={`mode-switch-button ${mode === "batch" ? "active" : ""}`}
        onClick={() => onChange("batch")}
      >
        Batch Session
      </button>
    </div>
  );
}

export default BatchModeSwitch;

