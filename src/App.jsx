import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getDatabase, ref, set, onValue } from 'firebase/database';

// Note: This code assumes Leaflet is loaded via a CDN in your index.html
// This check prevents an error if the script hasn't loaded yet.
if (typeof L !== 'undefined') {
  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
  });
}

const App = () => {
  // New state for password protection
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');

  // New state for custom modal
  const [modal, setModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: null,
    onCancel: null,
  });

  const [weatherData, setWeatherData] = useState(null);
  const [locationError, setLocationError] = useState('');
  const [loadingWeather, setLoadingWeather] = useState(true);
  const [userLatLon, setUserLatLon] = useState({ lat: 14.7921, lon: 120.8782 });
  const mapRef = useRef(null);
  const weatherLayerRef = useRef(null);
  const floodMarkersRef = useRef([]);
  const [showGeolocationTip, setShowGeolocationTip] = useState(true);
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [floodReports, setFloodReports] = useState([]);
  const mapSectionRef = useRef(null);
  const OPENWEATHER_API_KEY = 'c006710ad501bdbe1d47d7d180d51f64';

  // Function to show the custom modal
  const showModal = (title, message, onConfirm = null, onCancel = null) => {
    setModal({ isOpen: true, title, message, onConfirm, onCancel });
  };

  const closeModal = () => {
    setModal({ ...modal, isOpen: false });
  };

  // New function to handle password submission
  const handlePasswordSubmit = (e) => {
    e.preventDefault();
    // The password can be accessed from an environment variable in Vercel.
    // We check if 'process' exists to avoid the ReferenceError in the browser.
    const vercelPassword = (typeof process !== 'undefined' && process.env.REACT_APP_PASSWORD_KEY);
    const providedPassword = passwordInput.trim();

    if (providedPassword === vercelPassword) {
      setIsAuthenticated(true);
      setPasswordError('');
      // Persist authentication status in local storage
      localStorage.setItem('isAuthenticated', 'true');
    } else {
      setPasswordError('Incorrect password. Please try again.');
    }
  };

  // Function to handle logout
  const handleLogout = () => {
    setIsAuthenticated(false);
    localStorage.removeItem('isAuthenticated');
  };

  // Check local storage on component mount to see if the user is already authenticated
  useEffect(() => {
    const storedAuth = localStorage.getItem('isAuthenticated');
    if (storedAuth === 'true') {
      setIsAuthenticated(true);
    }
  }, []);

  // Firebase Initialization and Authentication
  useEffect(() => {
    const initFirebase = async () => {
      try {
        const firebaseConfig = {
          apiKey: "AIzaSyDlT5sCVMBZSWqYTu9hhstp4Fr7N66SWss",
          authDomain: "faceattendancerealtime-fbdf2.firebaseapp.com",
          databaseURL: "https://faceattendancerealtime-fbdf2-default-rtdb.firebaseio.com",
          projectId: "faceattendancerealtime-fbdf2",
          storageBucket: "faceattendancerealtime-fbdf2.appspot.com",
          messagingSenderId: "338410759674",
          appId: "1:338410759674:web:c6820d269c0029128a3043",
          measurementId: "G-NQDD7MCT09"
        };
        const effectiveAppId = firebaseConfig.projectId;
        const app = initializeApp(firebaseConfig);
        const realtimeDb = getDatabase(app);
        const firebaseAuth = getAuth(app);
        setDb(realtimeDb);
        setAuth(firebaseAuth);

        try {
          if (!firebaseAuth.currentUser) {
            await signInAnonymously(firebaseAuth);
          }
        } catch (error) {
          console.error("Firebase anonymous authentication error:", error);
          setLocationError("Failed to sign in anonymously. Community features may not work.");
        }

        const unsubscribe = onAuthStateChanged(firebaseAuth, (user) => {
          if (user) {
            setUserId(user.uid);
            setIsAuthReady(true);
            console.log("Firebase User ID:", user.uid);
          } else {
            setUserId(null);
            setIsAuthReady(true);
            console.log("No Firebase user is signed in.");
          }
        });

        return () => unsubscribe();
      } catch (error) {
        console.error("Error initializing Firebase:", error);
        setLocationError("Failed to initialize Firebase services. Community features may not work.");
      }
    };
    initFirebase();
  }, []);

  // Effect to get user's geolocation and fetch weather
  useEffect(() => {
    if (isAuthenticated) {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const { latitude, longitude } = position.coords;
            setUserLatLon({ lat: latitude, lon: longitude });
            fetchWeather(latitude, longitude);
            setShowGeolocationTip(false);
          },
          (error) => {
            console.error("Geolocation error:", error);
            setLocationError('Unable to retrieve your location. Displaying weather for Bulacan. Please ensure location permissions are granted in your browser settings.');
            fetchWeather(userLatLon.lat, userLatLon.lon);
            setShowGeolocationTip(true);
          },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
      } else {
        setLocationError('Geolocation is not supported by your browser. Displaying weather for Manila.');
        fetchWeather(userLatLon.lat, userLatLon.lon);
        setShowGeolocationTip(true);
      }
    }
  }, [isAuthenticated]);

  // Function to fetch weather data
  const fetchWeather = async (lat, lon) => {
    setLoadingWeather(true);
    if (OPENWEATHER_API_KEY === 'YOUR_OPENWEATHERMAP_API_KEY' || !OPENWEATHER_API_KEY) {
      setLocationError('Please get your OpenWeatherMap API key and replace the placeholder in the code.');
      setLoadingWeather(false);
      return;
    }
    try {
      const response = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_API_KEY}&units=metric`
      );
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error(`Unauthorized: Please check your OpenWeatherMap API key. It might be incorrect or not activated yet.`);
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setWeatherData(data);
    } catch (error) {
      console.error("Error fetching weather data:", error);
      setLocationError(`Failed to fetch weather data: ${error.message}.`);
    } finally {
      setLoadingWeather(false);
    }
  };

  // Effect to initialize and update the map and add flood markers
  useEffect(() => {
    if (isAuthenticated) {
      if (typeof L === 'undefined') {
        console.warn("Leaflet (L) is not loaded. Please ensure you have added the Leaflet CDN script to your index.html.");
        return;
      }
      if (!mapRef.current) {
        const map = L.map('map').setView([userLatLon.lat, userLatLon.lon], 7);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);
        if (OPENWEATHER_API_KEY !== 'YOUR_OPENWEATHERMAP_API_KEY' && OPENWEATHER_API_KEY) {
          const precipitationLayer = L.tileLayer(
            `https://tile.openweathermap.org/map/precipitation_new/{z}/{x}/{y}.png?appid=${OPENWEATHER_API_KEY}`,
            {
              attribution: 'Weather data &copy; <a href="https://openweathermap.org">OpenWeatherMap</a>',
              opacity: 0.6
            }
          ).addTo(map);
          weatherLayerRef.current = precipitationLayer;
        } else {
          console.warn("OpenWeatherMap API key not set for map layers.");
        }
        mapRef.current = map;
      } else {
        mapRef.current.setView([userLatLon.lat, userLatLon.lon], mapRef.current.getZoom());
      }
      if (mapRef.current && floodReports.length > 0) {
        floodMarkersRef.current.forEach(marker => {
          if (mapRef.current.hasLayer(marker)) {
            mapRef.current.removeLayer(marker);
          }
        });
        floodMarkersRef.current = [];
        floodReports.forEach(report => {
          const markerColor = getFloodLevelColor(report.floodLevel);
          const customIcon = L.divIcon({
            className: 'custom-div-icon',
            html: `<div style="background-color: ${markerColor}; width: 30px; height: 30px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 5px rgba(0,0,0,0.5);"></div>`,
            iconSize: [30, 30],
            iconAnchor: [15, 30],
            popupAnchor: [0, -20]
          });
          const marker = L.marker([report.latitude, report.longitude], { icon: customIcon }).addTo(mapRef.current);
          const timestamp = new Date(report.timestamp).toLocaleString();
          marker.bindPopup(`
            <div class="font-inter text-gray-800">
              <h3 class="font-bold text-lg mb-1">Report</h3>
              <p><strong>Level:</strong> ${report.floodLevel}</p>
              <p><strong>Details:</strong> ${report.message || 'No additional details.'}</p>
              <p><strong>Reported:</strong> ${timestamp}</p>
            </div>
          `);
          floodMarkersRef.current.push(marker);
        });
      }
    }
  }, [userLatLon, OPENWEATHER_API_KEY, floodReports, isAuthenticated]);

  const getFloodLevelColor = (level) => {
    switch (level) {
      case 'All Good!': return '#4CAF50';
      case 'Minor Injury': return '#8BC34A';
      case 'Medical Assistance': return '#FFEB3B';
      case 'Urgent Care Needed': return '#FFC107';
      case 'Emergency Situation': return '#F44336';
      default: return '#9E9E9E';
    }
  };

  useEffect(() => {
    if (db && isAuthReady && isAuthenticated) {
      const effectiveAppId = "faceattendancerealtime-fbdf2";
      const floodReportsRef = ref(db, `artifacts/${effectiveAppId}/public/data/currentFloodStatusByUsers`);
      console.log("Fetching flood reports from RTDB path:", `artifacts/${effectiveAppId}/public/data/currentFloodStatusByUsers`);

      const unsubscribe = onValue(floodReportsRef, (snapshot) => {
        const data = snapshot.val();
        const reports = [];
        if (data) {
          for (let userIdKey in data) {
            reports.push({
              id: userIdKey,
              userId: userIdKey,
              ...data[userIdKey],
              timestamp: data[userIdKey].timestamp || Date.now()
            });
          }
        }
        reports.sort((a, b) => b.timestamp - a.timestamp);
        setFloodReports(reports);
      }, (error) => {
        console.error("Error fetching flood reports from Realtime Database:", error);
        setLocationError("Failed to load community flood reports. Check your Realtime Database security rules.");
      });

      return () => unsubscribe();
    }
  }, [db, isAuthReady, isAuthenticated]);

  const handleViewOnMap = (lat, lon, message) => {
    if (mapRef.current) {
      mapRef.current.setView([lat, lon], 14);

      if (mapSectionRef.current) {
        mapSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }

      const targetMarker = floodMarkersRef.current.find(marker => {
        const markerLatLon = marker.getLatLng();
        const tolerance = 0.000001;
        return Math.abs(markerLatLon.lat - lat) < tolerance && Math.abs(markerLatLon.lng - lon) < tolerance;
      });

      if (targetMarker) {
        targetMarker.openPopup();
      } else {
        const tempMarker = L.marker([lat, lon]).addTo(mapRef.current);
        tempMarker.bindPopup(`
          <div class="font-inter text-gray-800">
            <h3 class="font-bold text-lg mb-1">Reported Location</h3>
            <p><strong>Details:</strong> ${message || 'No additional details.'}</p>
          </div>
        `).openPopup();
        setTimeout(() => {
          if (mapRef.current.hasLayer(tempMarker)) {
            mapRef.current.removeLayer(tempMarker);
          }
        }, 5000);
      }
    }
  };

  const SafetyBeacon = ({ userLat, userLon }) => {
    const [location, setLocation] = useState('');
    const [status, setStatus] = useState('Safe and sound');
    const [customMessage, setCustomMessage] = useState('');
    const [contactNumber, setContactNumber] = useState('');
    const [generatedMessage, setGeneratedMessage] = useState('');
    const [copySuccess, setCopySuccess] = useState('');

    useEffect(() => {
      const fetchLocationName = async () => {
        const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${userLat}&lon=${userLon}`;
        try {
          const response = await fetch(nominatimUrl, {
            headers: { 'User-Agent': 'PhilippinesCrisisApp/1.0 (your-email@example.com)' }
          });
          const data = await response.json();
          if (data && data.display_name) {
            setLocation(data.display_name);
          } else {
            setLocation(`Lat: ${userLat.toFixed(4)}, Lon: ${userLon.toFixed(4)}`);
          }
        } catch (error) {
          console.error("Error fetching location name:", error);
          setLocation(`Lat: ${userLat.toFixed(4)}, Lon: ${userLon.toFixed(4)}`);
        }
      };

      if (userLat && userLon) {
        fetchLocationName();
      }
    }, [userLat, userLon]);

    const generateMessage = () => {
      let message = `Crisis Update: I am ${status}.`;
      if (location) {
        message += ` My approximate location is: ${location}.`;
      } else {
        message += ` My approximate coordinates are Lat: ${userLat.toFixed(4)}, Lon: ${userLon.toFixed(4)}.`;
      }
      if (customMessage) {
        message += ` Additional info: ${customMessage}.`;
      }
      if (contactNumber) {
        message += ` Please contact me at: ${contactNumber}.`;
      }
      message += ``;
      setGeneratedMessage(message);
      setCopySuccess('');
    };

    const copyToClipboard = () => {
      if (generatedMessage) {
        try {
          const textarea = document.createElement('textarea');
          textarea.value = generatedMessage;
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand('copy');
          document.body.removeChild(textarea);
          setCopySuccess('Message copied to clipboard!');
        } catch (err) {
          console.error('Failed to copy text: ', err);
          setCopySuccess('Failed to copy message.');
        }
      }
    };

    const shareViaSMS = () => {
      if (generatedMessage) {
        const smsLink = `sms:?body=${encodeURIComponent(generatedMessage)}`;
        window.open(smsLink, '_self');
      }
    };

    return (
      <div className="space-y-4">
        <div>
          <label htmlFor="location" className="block text-gray-700 text-sm font-bold mb-2">
            Your Current Location (e.g., "Bulacan, Philippines" or specific address):
          </label>
          <input
            type="text"
            id="location"
            className="shadow appearance-none border rounded-lg w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-400"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g., My home in Quezon City"
          />
        </div>
        <div>
          <label htmlFor="status" className="block text-gray-700 text-sm font-bold mb-2">
            Your Status:
          </label>
          <select
            id="status"
            className="shadow border rounded-lg w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-400"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="Safe and sound">Safe and sound</option>
            <option value="Need assistance (food, water)">Need assistance (pagkain, tubig)</option>
            <option value="Stranded (cannot move)">Cannot move</option>
            <option value="Injured / Medical attention needed">Injured / Medical attention needed</option>
            <option value="Moved to a safe zone">Moved to a safe zone</option>
          </select>
        </div>
        <div>
          <label htmlFor="customMessage" className="block text-gray-700 text-sm font-bold mb-2">
            Additional Message (optional):
          </label>
          <textarea
            id="customMessage"
            rows="3"
            className="shadow appearance-none border rounded-lg w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-400"
            value={customMessage}
            onChange={(e) => setCustomMessage(e.target.value)}
            placeholder="ex: Sugatan ako, need ng rescue!"
          ></textarea>
        </div>
        <div>
          <label htmlFor="contactNumber" className="block text-gray-700 text-sm font-bold mb-2">
            Contact Number (optional):
          </label>
          <input
            type="tel"
            id="contactNumber"
            className="shadow appearance-none border rounded-lg w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-400"
            value={contactNumber}
            onChange={(e) => setContactNumber(e.target.value)}
            placeholder="e.g., +639171234567"
          />
        </div>
        <button
          onClick={generateMessage}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg shadow-md transition duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2"
        >
          Generate Safety Message
        </button>
        {generatedMessage && (
          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg shadow-inner">
            <p className="font-semibold text-blue-800 mb-2">Your Generated Message:</p>
            <p className="text-gray-800 break-words bg-white p-3 rounded-md border border-gray-200">
              {generatedMessage}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 mt-4">
              <button
                onClick={copyToClipboard}
                className="flex-1 bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg shadow-md transition duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-green-400 focus:ring-offset-2"
              >
                Copy to Clipboard
              </button>
              <button
                onClick={shareViaSMS}
                className="flex-1 bg-purple-500 hover:bg-purple-600 text-white font-bold py-2 px-4 rounded-lg shadow-md transition duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:ring-offset-2"
              >
                Share via SMS (Mobile Only)
              </button>
            </div>
            {copySuccess && <p className="text-green-600 text-center mt-2">{copySuccess}</p>}
          </div>
        )}
      </div>
    );
  };

  const FloodReporter = ({ userLat, userLon, db, userId, isAuthReady, showModal }) => {
    const [floodLevel, setFloodLevel] = useState('All Good!');
    const [message, setMessage] = useState('');

    const handleReport = () => {
      if (!db || !isAuthReady || !userId) {
        showModal("Error", "Please wait for authentication and database to initialize.");
        return;
      }
      const onConfirm = async () => {
        closeModal();
        try {
          const reportRef = ref(db, `artifacts/faceattendancerealtime-fbdf2/public/data/currentFloodStatusByUsers/${userId}`);
          await set(reportRef, {
            latitude: userLat,
            longitude: userLon,
            floodLevel,
            message,
            timestamp: Date.now(),
          });
          showModal("Success", "Report successfully sent!");
          setMessage("");
        } catch (error) {
          console.error("Error sending report:", error);
          showModal("Error", "Failed to send report. Please try again.");
        }
      };

      showModal(
        "Confirm Report",
        "Confirm your location?\n\nTo protect your privacy, make sure you’re not at home.\n\nPara sa iyong privacy, siguraduhin na hindi ka nasa bahay.",
        onConfirm,
        closeModal
      );
    };

    return (
      <div className="space-y-4">
        <div>
          <label htmlFor="floodLevel" className="block text-gray-700 text-sm font-bold mb-2">
            Current status at Your Location:
          </label>
          <select
            id="floodLevel"
            className="shadow border rounded-lg w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-400"
            value={floodLevel}
            onChange={(e) => setFloodLevel(e.target.value)}
          >
            <option value="All Good!">All Good - No need to worry, I'm okay!</option>
            <option value="Minor Injury">Minor Injury - May konting gasgas lang or sprain.</option>
            <option value="Medical Assistance">Medical Assistance - Need ng aid, like first aid or water.</option>
            <option value="Urgent Care Needed">Urgent Care Needed - Masakit na, need a medic right away.</option>
            <option value="Emergency Situation">Emergency Situation - Grabe, nasa emergency situation ako.</option>
          </select>
        </div>
        <label className="block font-semibold text-gray-700 mb-2">Additional Details (optional):</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="w-full border border-gray-300 rounded-lg p-2 mb-4"
          placeholder="Type here..."
        />
        <button
          onClick={handleReport}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg shadow hover:bg-blue-700 transition"
        >
          Send Report
        </button>
      </div>
    );
  };

  return (
    <div className="min-h-screen rally-bg font-inter text-gray-800 flex flex-col items-center justify-center relative">
      <style>
        {`
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&display=swap');
          body { font-family: 'Inter', sans-serif; }
          .rally-bg {
            background-image: url('images/image.jpg');
            background-size: cover;
            background-position: center;
            background-repeat: no-repeat;
            background-attachment: fixed;
          }
          #map {
            height: 400px;
            width: 100%;
            border-radius: 12px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
            margin-top: 24px;
            margin-bottom: 24px;
          }
          .leaflet-control-attribution {
            background: rgba(255, 255, 255, 0.7) !important;
            padding: 4px 8px !important;
            border-radius: 6px !important;
          }
          .custom-div-icon {
            background-color: transparent;
            border: none;
          }
        `}
        {/* Leaflet CSS loaded via CDN */}
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.7.1/dist/leaflet.css" crossOrigin="" />
      </style>

      {/* The custom modal UI */}
      {modal.isOpen && (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-50 flex justify-center items-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 shadow-2xl w-full max-w-sm text-center">
            <h3 className="text-xl font-bold mb-4 text-gray-800">{modal.title}</h3>
            <p className="text-gray-700 mb-6 whitespace-pre-line">{modal.message}</p>
            <div className="flex justify-center gap-4">
              {modal.onConfirm && (
                <button
                  onClick={modal.onConfirm}
                  className="bg-blue-600 text-white font-bold py-2 px-6 rounded-full transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2"
                >
                  Confirm
                </button>
              )}
              {modal.onCancel && (
                <button
                  onClick={modal.onCancel}
                  className="bg-gray-300 text-gray-800 font-bold py-2 px-6 rounded-full transition hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2"
                >
                  Cancel
                </button>
              )}
              {!modal.onConfirm && !modal.onCancel && (
                <button
                  onClick={closeModal}
                  className="bg-blue-600 text-white font-bold py-2 px-6 rounded-full transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2"
                >
                  OK
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Conditional rendering based on authentication */}
      {!isAuthenticated ? (
        // Password entry screen
        <div className="flex min-h-screen items-center justify-center p-4">
          <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-md text-center">
            <h1 className="text-3xl font-bold text-blue-700 mb-4">Access Protected</h1>
            <p className="text-gray-600 mb-6">Enter the password to access this application.</p>
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <input
                type="password"
                className="shadow appearance-none border rounded-lg w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="Enter password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
              />
              {passwordError && (
                <p className="text-red-500 text-sm mt-2">{passwordError}</p>
              )}
              <button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg shadow-md transition duration-300 ease-in-out transform hover:scale-105"
              >
                Continue
              </button>
            </form>
          </div>
        </div>
      ) : (
        // Original app content
        <div className="min-h-screen rally-bg font-inter text-gray-800 p-4 sm:p-6 md:p-8 flex flex-col items-center">
          <div className="absolute top-4 right-4 z-10">
            <button
              onClick={handleLogout}
              className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded-full shadow-md transition duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-2"
            >
              Logout
            </button>
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-yellow-100 mb-6 text-center drop-shadow-lg">
            ONE PEACE!
          </h1>
          <p className="text-lg text-gray-200 mb-8 text-center max-w-2xl">
          </p>
          {showGeolocationTip && (
            <div className="bg-yellow-100 border border-yellow-400 text-yellow-800 px-4 py-3 rounded-lg relative w-full max-w-3xl mb-6 shadow-md" role="alert">
              <strong className="font-bold">Location Access Needed:</strong>
              <span className="block sm:inline ml-2">
                To get real-time weather for your current location, please enable location services for this site in your browser settings. The app will default to Bulacan if access is denied.
              </span>
              <span className="absolute top-0 bottom-0 right-0 px-4 py-3">
                <svg className="fill-current h-6 w-6 text-yellow-500 cursor-pointer" role="button" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" onClick={() => setShowGeolocationTip(false)}>
                  <title>Close</title>
                  <path d="M14.348 14.849a1.2 1.2 0 0 1-1.697 0L10 11.819l-2.651 3.029a1.2 1.2 0 1 1-1.697-1.697l2.758-3.15-2.759-3.152a1.2 1.2 0 1 1 1.697-1.697L10 8.183l2.651-3.031a1.2 1.2 0 1 1 1.697 1.697l-2.758 3.152 2.758 3.15a1.2 1.2 0 0 1 0 1.698z" />
                </svg>
              </span>
            </div>
          )}
          <div className="bg-white p-6 sm:p-8 rounded-xl shadow-lg w-full max-w-3xl mb-8 border border-blue-200">
            <h2 className="text-3xl font-bold text-blue-700 mb-4 flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 mr-3 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2A10 10 0 1 0 22 12A10 10 0 0 0 12 2ZM12 20A8 8 0 1 1 20 12A8 8 0 0 1 12 20ZM12 4a8 8 0 0 0-7.07 12.07l.71-.71A7 7 0 0 1 12 5a7 7 0 0 1 7 7a7 7 0 0 1-7 7a7 7 0 0 1-7-7a1 1 0 0 0-2 0a9 9 0 0 0 9 9a9 9 0 0 0 9-9A9 9 0 0 0 12 4Z" />
              </svg>
              Current Weather
            </h2>
            {locationError && (
              <p className="text-red-600 bg-red-100 p-3 rounded-md mb-4 border border-red-300">
                {locationError}
              </p>
            )}
            {loadingWeather ? (
              <div className="text-center py-4">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500 mx-auto mb-2"></div>
                <p className="text-gray-600">Fetching weather data...</p>
              </div>
            ) : weatherData ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-lg">
                <div className="flex items-center">
                  <span className="font-semibold text-gray-700 mr-2">Location:</span>
                  <span className="text-blue-600">{weatherData.name}, {weatherData.sys.country}</span>
                </div>
                <div className="flex items-center">
                  <span className="font-semibold text-gray-700 mr-2">Temperature:</span>
                  <span className="text-blue-600">{weatherData.main.temp}°C</span>
                </div>
                <div className="flex items-center">
                  <span className="font-semibold text-gray-700 mr-2">Conditions:</span>
                  <span className="text-blue-600 capitalize">{weatherData.weather[0].description}</span>
                  <img
                    src={`https://openweathermap.org/img/wn/${weatherData.weather[0].icon}.png`}
                    alt={weatherData.weather[0].description}
                    className="w-10 h-10 ml-2"
                  />
                </div>
                <div className="flex items-center">
                  <span className="font-semibold text-gray-700 mr-2">Humidity:</span>
                  <span className="text-blue-600">{weatherData.main.humidity}%</span>
                </div>
                <div className="flex items-center">
                  <span className="font-semibold text-gray-700 mr-2">Wind Speed:</span>
                  <span className="text-blue-600">{weatherData.wind.speed} m/s</span>
                </div>
              </div>
            ) : (
              <p className="text-center text-gray-600">No weather data available.</p>
            )}
          </div>
          <div ref={mapSectionRef} className="bg-white p-6 sm:p-8 rounded-xl shadow-lg w-full max-w-3xl mb-8 border border-blue-200">
            <h2 className="text-3xl font-bold text-blue-700 mb-4 flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 mr-3 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2A10 10 0 1 0 22 12A10 10 0 0 0 12 2ZM12 20A8 8 0 1 1 20 12A8 8 0 0 1 12 20ZM12 4a8 8 0 0 0-7.07 12.07l.71-.71A7 7 0 0 1 12 5a7 7 0 0 1 7 7a7 7 0 0 1-7 7a7 7 0 0 1-7-7a1 1 0 0 0-2 0a9 9 0 0 0 9 9a9 9 0 0 0 9-9A9 9 0 0 0 12 4Z" />
                <path d="M12 12.75a.75.75 0 0 1-.75-.75V6a.75.75 0 0 1 1.5 0v6a.75.75 0 0 1-.75.75Z" />
                <path d="M12 17.5a.75.75 0 0 1-.75-.75V15a.75.75 0 0 1 1.5 0v1.75a.75.75 0 0 1-.75.75Z" />
              </svg>
              Nakama Status:
            </h2>
            <div id="map" className="h-96 w-full rounded-lg shadow-md"></div>
            <p className="text-sm text-gray-600 mt-4">
              Makikita din sa map na ’to ang current na lakas ng ulan.
              Mas dark ang kulay = mas malakas ang buhos, possible na signal ng masamang panahon o posibleng pagbaha.
            </p>
            <div className="mt-4 text-sm text-gray-700">
              <h4 className="font-semibold mb-2">Legend:</h4>
              <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <li><span className="inline-block w-3 h-3 rounded-full mr-2" style={{ backgroundColor: '#4CAF50' }}></span>No Help Needed</li>
                <li><span className="inline-block w-3 h-3 rounded-full mr-2" style={{ backgroundColor: '#8BC34A' }}></span>Minor Injury</li>
                <li><span className="inline-block w-3 h-3 rounded-full mr-2" style={{ backgroundColor: '#FFEB3B' }}></span>Medical Assistance</li>
                <li><span className="inline-block w-3 h-3 rounded-full mr-2" style={{ backgroundColor: '#FFC107' }}></span>Need Backup</li>
                <li><span className="inline-block w-3 h-3 rounded-full mr-2" style={{ backgroundColor: '#F44336' }}></span>Urgent Care Needed</li>
              </ul>
            </div>
          </div>
          <div className="bg-white p-6 sm:p-8 rounded-xl shadow-lg w-full max-w-3xl mb-8 border border-blue-200">
            <h2 className="text-3xl font-bold text-blue-700 mb-4 flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 mr-3 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v2h3l2.84 2.84c-.65.35-1.37.59-2.14.73zm7.45-2.73L15 14h-3V9l-5.16-5.16C7.38 3.23 8.66 3 10 3c3.87 0 7 3.13 7 7 0 1.34-.38 2.62-1.05 3.72z" />
              </svg>
              Community Watch
              {userId && (
                <span className="ml-auto text-sm text-gray-500"></span>
              )}
            </h2>
            <p className="text-gray-700 mb-4">
              Tulong-tulong tayo. I-update kung kung ano ganap sa lugar mo para aware din ’yung iba. Check real-time reports sa map sa taas.
            </p>
            <FloodReporter userLat={userLatLon.lat} userLon={userLatLon.lon} db={db} userId={userId} isAuthReady={isAuthReady} showModal={showModal} />
            <div className="mt-6">
              <h3 className="text-2xl font-bold text-blue-700 mb-3 flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 mr-2 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v2h3l2.84 2.84c-.65.35-1.37.59-2.14.73zm7.45-2.73L15 14h-3V9l-5.16-5.16C7.38 3.23 8.66 3 10 3c3.87 0 7 3.13 7 7 0 1.34-.38 2.62-1.05 3.72z" />
                </svg>
                Latest Reports
              </h3>
              {floodReports.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {floodReports.slice(0, 6).map((report) => (
                    <div key={report.id} className="bg-blue-50 p-4 rounded-lg shadow-sm border border-blue-200">
                      <p className="font-semibold text-blue-800">{report.floodLevel}</p>
                      <p className="text-gray-700 text-sm">{report.message || 'No additional details.'}</p>
                      <p className="text-gray-500 text-xs mt-1">
                        {new Date(report.timestamp).toLocaleString()}
                      </p>
                      <button
                        onClick={() => handleViewOnMap(report.latitude, report.longitude, report.message)}
                        className="mt-2 bg-blue-500 hover:bg-blue-600 text-white text-xs font-bold py-1 px-3 rounded-full transition duration-200 ease-in-out"
                      >
                        View on Map
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-600">No reports yet. Be the first to report!</p>
              )}
            </div>
          </div>
          <div className="bg-white p-6 sm:p-8 rounded-xl shadow-lg w-full max-w-3xl border border-blue-200">
            <h2 className="text-3xl font-bold text-blue-700 mb-4 flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 mr-3 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2A10 10 0 1 0 22 12A10 10 0 0 0 12 2ZM12 20A8 8 0 1 1 20 12A8 8 0 0 1 12 20ZM12 4a8 8 0 0 0-7.07 12.07l.71-.71A7 7 0 0 1 12 5a7 7 0 0 1 7 7a7 7 0 0 1-7 7a7 7 0 0 1-7-7a1 1 0 0 0-2 0a9 9 0 0 0 9 9a9 9 0 0 0 9-9A9 9 0 0 0 12 4Z" />
                <path d="M12 17.5a.75.75 0 0 1-.75-.75V15a.75.75 0 0 1 1.5 0v1.75a.75.75 0 0 1-.75.75Z" />
                <path d="M12 12.75a.75.75 0 0 1-.75-.75V6a.75.75 0 0 1 1.5 0v6a.75.75 0 0 1-.75.75Z" />
              </svg>
              Safety Beacon
            </h2>
            <p className="text-gray-700 mb-4">
              Send a quick status update with your location para alam ng fam, friends kung nasaan ka at anong need mo.
            </p>
            <SafetyBeacon userLat={userLatLon.lat} userLon={userLatLon.lon} />
          </div>
          <div className="bg-white p-6 sm:p-8 rounded-xl shadow-lg w-full max-w-3xl mt-8 border border-blue-200 text-center">
            <h2 className="text-2xl font-bold text-blue-700 mb-3">
              Developer Information
            </h2>
            <p className="text-gray-700 text-lg">
              Developed by First Name SORATA
            </p>
            <p className="text-gray-700 text-md mt-2">
              TikTok: @first.sorata480
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
export default App;
