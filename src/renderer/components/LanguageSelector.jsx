function LanguageSelector({ value, onChange, disabled = false }) {
  return (
    <div className="field">
      <label htmlFor="language">Language</label>
      <select
        id="language"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
      >
        <option value="Python">Python</option>
        <option value="Java">Java</option>
      </select>
    </div>
  );
}

export default LanguageSelector;
