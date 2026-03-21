// import { useEffect, useState } from 'react';
// import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
// import { isAuthenticated } from './services/authService';
// import Login from './pages/Login';
// import Register from './pages/Register';
// import Dashboard from './pages/Dashboard';
// import Settings from './pages/Settings';
// import Campaigns from './pages/Campaigns';
// import Broadcast from './pages/Broadcast';
// import Templates from './pages/Templates';
// import Analytics from './pages/Analytics';
// import Contacts from './pages/Contacts';
// import Inbox from './pages/Inbox';
// import Chatbot from './components/Chatbot';

// // Protected Route Component
// const ProtectedRoute = ({ children }) => {
//   return isAuthenticated() ? children : <Navigate to="/login" replace />;
// };

// // Public Route Component (redirect to dashboard if already logged in)
// const PublicRoute = ({ children }) => {
//   return !isAuthenticated() ? children : <Navigate to="/dashboard" replace />;
// };

// // Connect WhatsApp page: FB login with code, send to backend /exchange-token
// function ConnectWhatsApp({ fbReady }) {
//   const handleSignup = () => {

//     if (!window.FB) {
//       alert("FB not ready yet");
//       return;
//     }

//     window.FB.getLoginStatus(function (response) {

//       window.FB.login(function (response) {
//         console.log(response);
//       }, {
//         scope: "whatsapp_business_management,whatsapp_business_messaging"
//       });

//     });

//   };

//   return (
//     <div style={{ textAlign: "center", marginTop: "100px" }}>
//       <button onClick={handleSignup} disabled={!fbReady}>
//         Connect WhatsApp
//       </button>
//       {!fbReady && <p style={{ marginTop: 8, fontSize: 14, color: "#666" }}>Loading Facebook SDK...</p>}
//     </div>
//   );
// }

// function App() {
//   const [fbReady, setFbReady] = useState(false);

//   useEffect(() => {
//     window.fbAsyncInit = function () {
//       window.FB.init({
//         appId: process.env.META_APP_ID,
//         cookie: true,
//         xfbml: true,
//         version: "v18.0"
//       });

//       console.log("Facebook SDK Initialized");
//     };

//     (function (d, s, id) {
//       let js, fjs = d.getElementsByTagName(s)[0];
//       if (d.getElementById(id)) return;
//       js = d.createElement(s);
//       js.id = id;
//       js.src = "https://connect.facebook.net/en_US/sdk.js";
//       fjs.parentNode.insertBefore(js, fjs);
//     }(document, 'script', 'facebook-jssdk'));

//   }, []);

//   return (
//     <Router>
//       <Routes>
//         <Route
//           path="/login"
//           element={
//             <PublicRoute>
//               <Login />
//             </PublicRoute>
//           }
//         />
//         <Route
//           path="/register"
//           element={
//             <PublicRoute>
//               <Register />
//             </PublicRoute>
//           }
//         />
//         <Route
//           path="/dashboard"
//           element={
//             <ProtectedRoute>
//               <Dashboard />
//             </ProtectedRoute>
//           }
//         />
//         <Route
//           path="/settings"
//           element={
//             <ProtectedRoute>
//               <Settings />
//             </ProtectedRoute>
//           }
//         />
//         <Route
//           path="/campaigns"
//           element={
//             <ProtectedRoute>
//               <Campaigns />
//             </ProtectedRoute>
//           }
//         />
//         <Route
//           path="/broadcast"
//           element={
//             <ProtectedRoute>
//               <Broadcast />
//             </ProtectedRoute>
//           }
//         />
//         <Route
//           path="/templates"
//           element={
//             <ProtectedRoute>
//               <Templates />
//             </ProtectedRoute>
//           }
//         />
//         <Route
//           path="/analytics"
//           element={
//             <ProtectedRoute>
//               <Analytics />
//             </ProtectedRoute>
//           }
//         />
//         <Route
//           path="/contacts"
//           element={
//             <ProtectedRoute>
//               <Contacts />
//             </ProtectedRoute>
//           }
//         />
//         <Route
//           path="/inbox"
//           element={
//             <ProtectedRoute>
//               <Inbox />
//             </ProtectedRoute>
//           }
//         />
//         <Route
//           path="/connect-whatsapp"
//           element={
//             <ProtectedRoute>
//               <ConnectWhatsApp fbReady={fbReady} />
//             </ProtectedRoute>
//           }
//         />
//         <Route path="/" element={<Navigate to="/dashboard" replace />} />
//       </Routes>
//       {/* Chatbot - appears on all pages when authenticated */}
//       <Chatbot />
//     </Router>
//   );
// }

// export default App;






import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { isAuthenticated } from './services/authService';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';
import Campaigns from './pages/Campaigns';
import Broadcast from './pages/Broadcast';
import Templates from './pages/Templates';
import Analytics from './pages/Analytics';
import Contacts from './pages/Contacts';
import Inbox from './pages/Inbox';
import Chatbot from './components/Chatbot';
import ProjectLogin from './pages/ProjectLogin';
import ProjectDashboard from './pages/ProjectDashboard';
import AgentHomePage from './pages/AgentHomePage';
import AgentAnalyticsPage from './pages/AgentAnalyticsPage';
import BroadcastCampaignPage from './pages/BroadcastCampaignPage';
import LiveChatPage from './pages/LiveChatPage';
import TemplateMessagesPage from './pages/TemplateMessagesPage';
import ContactManagementPage from './pages/ContactManagementPage';
import ManagePage from './pages/ManagePage';
import CampaignReportsPage from './pages/CampaignReportsPage';
import HistoryPage from './pages/HistoryPage';
import AgentChatPage from './pages/AgentChatPage';
import AdminDashboard from './pages/AdminDashboard';
import AgentDashboard from './pages/AgentDashboard';

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  return isAuthenticated() ? children : <Navigate to="/login" replace />;
};

// Public Route Component
const PublicRoute = ({ children }) => {
  return !isAuthenticated() ? children : <Navigate to="/dashboard" replace />;
};

// Admin-only route: show ProjectDashboard if user role is admin, else redirect to /
const AdminDashboardRoute = () => {
  let isAdmin = false;
  try {
    const raw = localStorage.getItem("user");
    if (raw) {
      const user = JSON.parse(raw);
      isAdmin = String(user?.role || "").toLowerCase() === "admin";
    }
  } catch (e) {}
  return isAdmin ? <ProjectDashboard /> : <Navigate to="/" replace />;
};

// Agent dashboard: agent or admin with token can access (admin when viewing a project); else redirect to /login
const AgentDashboardRoute = () => {
  const token = localStorage.getItem("token");
  const role = (localStorage.getItem("role") || "").toLowerCase();
  if (token && (role === "agent" || role === "admin")) {
    return <AgentHomePage />;
  }
  return <Navigate to="/login" replace />;
};

// Connect WhatsApp — direct OAuth redirect (no SDK). Meta redirects to /meta/callback?code=...&state=clientId
function ConnectWhatsApp() {
  const connectWhatsApp = () => {
    const APP_ID =
      process.env.META_APP_ID ||
      "1562341501476558";
    const CONFIG_ID = process.env.REACT_APP_META_CONFIG_ID || "1616537092881932";
    const baseFromApi = process.env.REACT_APP_API_URL
      ? String(process.env.REACT_APP_API_URL).replace(/\/$/, "") + "/meta/callback"
      : "";
    const REDIRECT_URI =
      process.env.REACT_APP_META_REDIRECT_URI ||
      process.env.META_REDIRECT_URI ||
      baseFromApi ||
      "https://dorris-hemitropic-immanuel.ngrok-free.dev/meta/callback";

    let clientId = null;
    try {
      const token = localStorage.getItem("token");
      if (token) {
        const payload = JSON.parse(atob(token.split(".")[1]));
        clientId = payload.id;
      }
    } catch (e) { }

    if (!APP_ID || !REDIRECT_URI) {
      alert("Missing APP_ID or REDIRECT_URI. Check .env and restart dev server (npm start).");
      return;
    }

    const params = new URLSearchParams({
      client_id: APP_ID,
      redirect_uri: REDIRECT_URI,
      response_type: "code",
      scope: "whatsapp_business_management,business_management",
    });
    if (CONFIG_ID) params.set("config_id", CONFIG_ID);
    if (clientId != null) params.set("state", String(clientId));

    const url = `https://www.facebook.com/v19.0/dialog/oauth?${params.toString()}`;
    window.location.href = url;
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-gray-900">WhatsApp Business</h1>
        <p className="mt-2 text-sm text-gray-600">
          Sign in with Meta to connect your WhatsApp Business account.
        </p>
        <button
          type="button"
          onClick={connectWhatsApp}
          className="mt-6 w-full rounded-lg bg-teal-700 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
        >
          Connect WhatsApp
        </button>
      </div>
    </div>
  );
}

function App() {
  return (
    <Router>
      <Routes>

        <Route
          path="/login"
          element={
            <PublicRoute>
              <Login />
            </PublicRoute>
          }
        />

        <Route
          path="/register"
          element={
            <PublicRoute>
              <Register />
            </PublicRoute>
          }
        />

        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />

        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <Settings />
            </ProtectedRoute>
          }
        />

        <Route
          path="/campaigns"
          element={
            <ProtectedRoute>
              <Campaigns />
            </ProtectedRoute>
          }
        />

        <Route
          path="/broadcast"
          element={
            <ProtectedRoute>
              <Broadcast />
            </ProtectedRoute>
          }
        />

        <Route
          path="/templates"
          element={
            <ProtectedRoute>
              <Templates />
            </ProtectedRoute>
          }
        />

        <Route
          path="/analytics"
          element={
            <ProtectedRoute>
              <Analytics />
            </ProtectedRoute>
          }
        />

        <Route
          path="/contacts"
          element={
            <ProtectedRoute>
              <Contacts />
            </ProtectedRoute>
          }
        />

        <Route
          path="/manage"
          element={
            <ProtectedRoute>
              <ManagePage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/live-chat"
          element={
            <ProtectedRoute>
              <LiveChatPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/campaign-reports"
          element={
            <ProtectedRoute>
              <HistoryPage />
            </ProtectedRoute>
          }
        />

        {/* Simple project login/dashboard demo (uses axios instance and projects API) */}
        <Route
          path="/project-login"
          element={
            <PublicRoute>
              <ProjectLogin />
            </PublicRoute>
          }
        />
        <Route
          path="/project-dashboard"
          element={<AdminDashboardRoute />}
        />
        <Route
          path="/agent-dashboard"
          element={<AgentDashboardRoute />}
        />

        <Route
          path="/inbox"
          element={
            <ProtectedRoute>
              <Inbox />
            </ProtectedRoute>
          }
        />

        <Route
          path="/connect-whatsapp"
          element={
            <ProtectedRoute>
              <ConnectWhatsApp />
            </ProtectedRoute>
          }
        />

        <Route path="/admin" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
        <Route path="/agent" element={<ProtectedRoute><AgentDashboard /></ProtectedRoute>} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/agent-chat" element={<AgentChatPage />} />

      </Routes>

      {/* Chatbot appears on all authenticated pages */}
      <Chatbot />

    </Router>
  );
}

export default App;