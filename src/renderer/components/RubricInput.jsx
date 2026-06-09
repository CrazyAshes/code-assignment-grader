function RubricInput({ value, onChange, disabled = false }) {
  return (
    <div className="field">
      <label htmlFor="rubric">Rubric</label>
      <textarea
        id="rubric"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        placeholder="Paste the grading criteria and point breakdown here..."
        rows={8}
      />
    </div>
  );
}

export default RubricInput;
