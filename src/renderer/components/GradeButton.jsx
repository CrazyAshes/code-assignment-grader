function GradeButton({ onClick, disabled, loading }) {
  return (
    <button
      type="button"
      className="btn-primary btn-full"
      style={{ padding: "11px 16px", fontSize: "14px", borderRadius: "var(--radius-md)" }}
      onClick={onClick}
      disabled={disabled || loading}
    >
      {loading ? (
        <span style={{ display: "flex", alignItems: "center", gap: "8px", justifyContent: "center" }}>
          <span style={{
            width: "14px", height: "14px",
            border: "2px solid rgba(255,255,255,0.4)",
            borderTopColor: "#fff",
            borderRadius: "50%",
            display: "inline-block",
            animation: "spin 0.7s linear infinite"
          }} />
          Grading...
        </span>
      ) : "Grade"}
    </button>
  );
}

export default GradeButton;
