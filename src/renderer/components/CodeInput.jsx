function CodeInput({ value, onChange, disabled = false }) {
  return (
    <div className="field">
      <label htmlFor="studentCode">Student code</label>
      <textarea
        id="studentCode"
        className="code-textarea"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        placeholder="Paste student Python or Java code here..."
        rows={12}
      />
    </div>
  );
}

export default CodeInput;
