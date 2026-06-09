function StrictnessSelector({ value, onChange, disabled = false }) {
  return (
    <div className="field">
      <label htmlFor="strictness">Grading strictness</label>
      <select
        id="strictness"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
      >
        <option value="easy">Easy (give partial credit generously)</option>
        <option value="balanced">Balanced</option>
        <option value="strict">Strict</option>
      </select>
    </div>
  );
}

export default StrictnessSelector;
