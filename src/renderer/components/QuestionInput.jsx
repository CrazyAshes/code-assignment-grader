function QuestionInput({ value, onChange, disabled = false }) {
  return (
    <div className="field">
      <label htmlFor="questions">Assignment questions</label>
      <textarea
        id="questions"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        placeholder="Paste assignment questions/prompts here..."
        rows={5}
      />
    </div>
  );
}

export default QuestionInput;
