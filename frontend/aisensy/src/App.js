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






import { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom';
import { isAuthenticated } from './services/authService';
import Login from './pages/Login';
import Register from './pages/Register';
import RegisterOtpVerification from './pages/RegisterOtpVerification';
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';
import Campaigns from './pages/Campaigns';
import Broadcast from './pages/Broadcast';
import Templates from './pages/Templates';
import Analytics from './pages/Analytics';
import Contacts from './pages/Contacts';
import Inbox from './pages/Inbox';
import Flows from './pages/Flows';
import Chatbot from './components/Chatbot';
import MainSidebarNav from './components/MainSidebarNav';
import ProjectLogin from './pages/ProjectLogin';
import ProjectDashboard from './pages/ProjectDashboard';
import AgentHomePage from './pages/AgentHomePage';
import AgentAnalyticsPage from './pages/AgentAnalyticsPage';
import BroadcastCampaignPage from './pages/BroadcastCampaignPage';
import LiveChatPage from './pages/LiveChatPage';
import TemplateMessagesPage from './pages/TemplateMessagesPage';
import ContactManagementPage from './pages/ContactManagementPage';
import ManagePage from './pages/ManagePage';
import AgentManageCannedMessagesPage from './pages/AgentManageCannedMessagesPage';
import SuperAdminDashboard from './pages/SuperAdminDashboard';
import CampaignReportsPage from './pages/CampaignReportsPage';
import HistoryPage from './pages/HistoryPage';
import ReportsComingSoonPage from './pages/ReportsComingSoonPage';
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

const SuperAdminDashboardRoute = () => {
  let isSuperAdmin = false;
  try {
    const raw = localStorage.getItem("user");
    if (raw) {
      const user = JSON.parse(raw);
      isSuperAdmin = String(user?.role || "").toLowerCase() === "super_admin";
    }
  } catch (e) {}
  return isSuperAdmin ? <SuperAdminDashboard /> : <Navigate to="/" replace />;
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
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const user = (() => {
    try {
      const raw = localStorage.getItem("user");
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  })();
  const userName = user?.name || "User";
  const userInitial = userName.charAt(0).toUpperCase();

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
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      <header className="motion-header-enter shrink-0 z-10 bg-white/90 backdrop-blur-md border-b border-gray-200/80 px-4 md:px-8 py-3.5 md:py-4 flex justify-between items-center shadow-sm shadow-gray-200/50">
        <div className="flex items-center gap-4 min-w-0">
          <button
            type="button"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2.5 rounded-xl hover:bg-gray-100/80 active:scale-95 transition lg:hidden"
            aria-label="Toggle sidebar"
          >
            <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <Link to="/dashboard" className="flex items-center gap-3 transition-all duration-300 hover:opacity-90 hover:scale-[1.02] active:scale-[0.98] shrink-0">
            <div className="w-10 h-10 bg-gradient-to-br from-sky-500 via-sky-600 to-blue-900 rounded-xl flex items-center justify-center shadow-lg shadow-sky-500/30 ring-2 ring-white">
              <span className="text-white font-bold text-lg">A</span>
            </div>
            <h1 className="text-xl md:text-2xl font-bold bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent hidden sm:block">
              AiSensy
            </h1>
          </Link>

          <span className="text-gray-300 hidden md:block shrink-0">|</span>
          <h2 className="text-lg font-semibold text-sky-700 hidden md:block tracking-tight">Connect WhatsApp</h2>
        </div>

        <button
          type="button"
          onClick={() => navigate("/settings")}
          className="w-10 h-10 rounded-full bg-gradient-to-br from-sky-500 via-sky-600 to-blue-700 flex items-center justify-center cursor-pointer shadow-md shadow-sky-500/35 hover:shadow-lg hover:ring-2 ring-sky-300/60 hover:scale-[1.03] transition-all duration-200 focus:outline-none"
        >
          <span className="text-white font-semibold text-sm">{userInitial}</span>
        </button>
      </header>

      <div className="flex flex-1 min-h-0">
        <aside
          className={`bg-sky-950 text-white border-r border-sky-900 h-full shrink-0 flex flex-col overflow-hidden transition-all duration-300 ${
            sidebarOpen ? "w-20" : "w-0 md:w-20"
          }`}
        >
          <MainSidebarNav />
        </aside>

        <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-gradient-to-b from-sky-50/90 via-white to-sky-100/50">
          <div className="relative isolate min-h-full flex items-center justify-center p-4 md:p-8 lg:p-10">
            <div className="pointer-events-none absolute inset-0 overflow-hidden -z-10" aria-hidden>
              <div className="absolute -top-28 -right-20 w-[22rem] h-[22rem] bg-sky-400/30 motion-page-blob" />
              <div className="absolute -bottom-36 -left-24 w-[20rem] h-[20rem] bg-blue-400/25 motion-page-blob motion-page-blob--b" />
            </div>

            <div className="motion-enter w-full max-w-md relative z-0">
              <div className="group relative motion-card-rich motion-hover-lift rounded-2xl border border-gray-100/90 bg-white/95 backdrop-blur-sm p-8 md:p-10 text-center shadow-lg shadow-gray-200/40 ring-1 ring-gray-100/80 overflow-hidden">
                <span className="motion-card-shine pointer-events-none absolute inset-0 overflow-hidden rounded-2xl" aria-hidden>
                  <span className="motion-card-shine__beam absolute inset-0" />
                </span>

                <div className="relative mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 via-sky-600 to-blue-700 shadow-lg shadow-sky-500/35 ring-2 ring-white">
                  <svg className="h-8 w-8 text-white" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                </div>

                <h1 className="relative text-xl md:text-2xl font-bold text-gray-900 tracking-tight">WhatsApp Business</h1>
                <p className="relative mt-3 text-sm md:text-base text-gray-600 leading-relaxed">
                  Sign in with Meta to connect your WhatsApp Business account.
                </p>

                <button
                  type="button"
                  onClick={connectWhatsApp}
                  className="group/btn relative mt-8 w-full overflow-hidden rounded-xl bg-gradient-to-r from-sky-600 via-sky-500 to-blue-600 px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-sky-600/30 transition-all duration-300 hover:shadow-xl hover:shadow-sky-500/35 hover:scale-[1.02] active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-sky-400/50 focus:ring-offset-2"
                >
                  <span className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/15 to-white/0 translate-x-[-100%] group-hover/btn:translate-x-[100%] transition-transform duration-700" aria-hidden />
                  <span className="relative flex items-center justify-center gap-2">
                    <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                    </svg>
                    Connect WhatsApp
                  </span>
                </button>
              </div>
            </div>
          </div>
        </main>
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
          path="/register/verify-otp"
          element={
            <PublicRoute>
              <RegisterOtpVerification />
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
          path="/flows"
          element={
            <ProtectedRoute>
              <Flows />
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
          path="/agent-manage"
          element={
            <ProtectedRoute>
              <AgentManageCannedMessagesPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/superadmin-dashboard"
          element={
            <ProtectedRoute>
              <SuperAdminDashboardRoute />
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

        <Route
          path="/reports"
          element={
            <ProtectedRoute>
              <ReportsComingSoonPage />
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

      {/* Chatbot appears on all authenticated pages (except SuperAdmin) */}
      {String(localStorage.getItem("role") || "").toLowerCase() !== "super_admin" ? <Chatbot /> : null}

    </Router>
  );
}

export default App;