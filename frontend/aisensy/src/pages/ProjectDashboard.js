import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "../api/axios";
import ProjectCard from "../components/ProjectCard";

function ProjectDashboard() {
  const navigate = useNavigate();
  const [projectName, setProjectName] = useState("");
  const [projects, setProjects] = useState([]);

  const user = JSON.parse(localStorage.getItem("user"));

  const fetchProjects = async () => {
    try {
      const res = await axios.get("/projects/list");
      setProjects(res.data.projects || []);
    } catch (error) {
      console.log(error);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const createProject = async () => {
    if (!projectName) {
      return alert("Enter project name");
    }

    try {
      await axios.post("/projects/create", {
        project_name: projectName,
      });

      setProjectName("");
      fetchProjects();
    } catch (error) {
      alert(error.response?.data?.message || "Failed to create project");
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 px-10 py-8">
      
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-2xl font-semibold text-gray-800">
          Welcome, {user?.name}
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Manage your projects easily
          {user?.role && (
            <span className="ml-2 px-2 py-0.5 rounded bg-blue-100 text-blue-700 text-xs font-medium capitalize">
              {user.role}
            </span>
          )}
        </p>
      </div>

      {/* Create Project Card */}
      <div className="bg-white p-6 rounded-xl shadow-sm mb-10">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">
          Create New Project
        </h3>

        <div className="flex gap-4">
          <input
            type="text"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="Enter project name"
            className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          <button
            onClick={createProject}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg text-sm font-medium transition duration-200"
          >
            + Create Project
          </button>
        </div>
      </div>

      {/* Projects Section */}
      <div>
        <h3 className="text-lg font-semibold text-gray-800 mb-5">
          Recent Projects
        </h3>

        {projects.length === 0 ? (
          <div className="bg-white p-10 rounded-xl shadow-sm text-center text-gray-500">
            No Projects Found
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <div
                key={project.id}
                role="button"
                tabIndex={0}
                onClick={() => {
                  try {
                    localStorage.setItem("selectedProject", JSON.stringify(project));
                  } catch (e) {}
                  navigate("/dashboard", { state: { project } });
                }}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  try {
                    localStorage.setItem("selectedProject", JSON.stringify(project));
                  } catch (err) {}
                  navigate("/dashboard", { state: { project } });
                }}
                className="bg-white p-5 rounded-xl shadow-sm hover:shadow-md transition duration-200 cursor-pointer"
              >
                <ProjectCard project={project} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default ProjectDashboard;