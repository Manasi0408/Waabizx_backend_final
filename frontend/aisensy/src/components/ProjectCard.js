import React from "react";

function ProjectCard({ project }) {
  const role = project.owner_role || project.role;
  return (
    <div
      style={{
        border: "1px solid #ccc",
        padding: 15,
        marginBottom: 10,
        borderRadius: 8,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <h4 style={{ margin: 0 }}>{project.project_name}</h4>
        {role && (
          <span
            style={{
              fontSize: 11,
              padding: "2px 8px",
              borderRadius: 6,
              background: "#dbeafe",
              color: "#1d4ed8",
              fontWeight: 500,
              textTransform: "capitalize",
            }}
          >
            {role}
          </span>
        )}
      </div>
      <p>Status: {project.status || "N/A"}</p>
      <p>
        Created:{" "}
        {project.created_at
          ? new Date(project.created_at).toLocaleDateString()
          : ""}
      </p>
    </div>
  );
}

export default ProjectCard;

