'use strict';

// --- STATE MANAGEMENT ---
let appState = {
  currentView: "user",
  reports: [],
  currentUserLat: null,
  currentUserLng: null,
  currentUserAccuracy: null,
};

const evacuationSites = [
  { name: "Evacuation Site 1", lat: 14.6, lng: 121.0 },
  { name: "Evacuation Site 2", lat: 14.65, lng: 121.05 },
  { name: "Evacuation Site 3", lat: 14.55, lng: 120.95 },
];

/**
 * Calculates the distance between two coordinates using the Haversine formula
 * @param {number} lat1 Latitude of the first point
 * @param {number} lon1 Longitude of the first point
 * @param {number} lat2 Latitude of the second point
 * @param {number} lon2 Longitude of the second point
 * @returns {number} The distance in kilometers
 */
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) *
      Math.cos(deg2rad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in km
  return d;
}

function deg2rad(deg) {
  return deg * (Math.PI / 180);
}

/**
 * Finds the nearest evacuation site to a given point
 * @param {number} lat The latitude of the point
 * @param {number} lng The longitude of the point
 * @returns {object} The nearest evacuation site
 */
function findNearestSite(lat, lng) {
  let nearestSite = null;
  let minDistance = Infinity;

  evacuationSites.forEach((site) => {
    const distance = getDistance(lat, lng, site.lat, site.lng);
    if (distance < minDistance) {
      minDistance = distance;
      nearestSite = site;
    }
  });

  return nearestSite;
}

let selectedSeverityLevel = "";
let currentVerificationMode = "photo"; // Default
let sensorVerified = false;
let adminMap = null;
let userPickerMap = null;
let manualMarker = null;

function openManualLocationPicker() {
  document
    .getElementById("manual-location-picker")
    .classList.remove("hidden");

  const center = [
    appState.currentUserLat || 12.8797,
    appState.currentUserLng || 121.774,
  ];

  if (!userPickerMap) {
    userPickerMap = L.map("user-picker-map").setView(center, 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(userPickerMap);
  }

  if (!manualMarker) {
    manualMarker = L.marker(center, { draggable: true }).addTo(userPickerMap);
  } else {
    manualMarker.setLatLng(center);
  }
  userPickerMap.setView(center, 13);
}

function closeManualLocationPicker() {
  document
    .getElementById("manual-location-picker")
    .classList.add("hidden");
}

function confirmManualLocation() {
  const { lat, lng } = manualMarker.getLatLng();
  appState.currentUserLat = lat;
  appState.currentUserLng = lng;
  appState.currentUserAccuracy = 0; // 0 indicates manual selection

  document.getElementById(
    "gps-coords"
  ).innerText = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  document.getElementById(
    "gps-accuracy"
  ).innerHTML = `<span class="text-blue-600 font-bold">Manually Selected</span>`;

  closeManualLocationPicker();
}

function initializeAdminMap() {
  if (adminMap) return; // Don't re-initialize

  // Approx center of the Philippines
  const mapCenter = [12.8797, 121.774];
  
  adminMap = L.map("admin-map").setView(mapCenter, 5);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(adminMap);
}


// --- VIEW CONTROLLER ---

/**
 * Toggles between user and admin view
 */
function toggleRole() {
  const btn = document.getElementById("role-label");
  if (appState.currentView === "user") {
    appState.currentView = "admin";
    document.getElementById("view-user").classList.add("hidden");
    document.getElementById("view-admin").classList.remove("hidden");
    btn.innerText = "Switch to User";
    initializeAdminMap();
    renderAdminFeed();
  } else {
    appState.currentView = "user";
    document.getElementById("view-admin").classList.add("hidden");
    document.getElementById("view-user").classList.remove("hidden");
    btn.innerText = "Switch to Admin";
  }
}

// --- USER FLOW ---

/**
 * Starts the report process
 */
function startReport() {
  document.getElementById("user-home").classList.add("hidden");
  document.getElementById("user-form").classList.remove("hidden");

  // 1. AUTOMATIC LOCATION TRACKING
  if ("geolocation" in navigator) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        appState.currentUserLat = position.coords.latitude;
        appState.currentUserLng = position.coords.longitude;
        appState.currentUserAccuracy = position.coords.accuracy;

        document.getElementById(
          "gps-coords"
        ).innerText = `${position.coords.latitude.toFixed(
          4
        )}, ${position.coords.longitude.toFixed(4)}`;

        const accColor =
          position.coords.accuracy < 20
            ? "text-green-600"
            : "text-yellow-600";
        document.getElementById(
          "gps-accuracy"
        ).innerHTML = `Accuracy: <span class="${accColor} font-bold">Within ${Math.round(
          position.coords.accuracy
        )}m</span>`;
      },
      (error) => {
        document.getElementById("gps-coords").innerText =
          "Location Denied";
        document.getElementById("gps-accuracy").innerText =
          "Please enable GPS";
      }
    );
  } else {
    alert("Geolocation is not supported by this browser.");
  }
}

/**
 * Selects the severity level of the report
 * @param {string} level The severity level
 */
function selectSeverity(level) {
  selectedSeverityLevel = level;
  document.querySelectorAll(".severity-btn").forEach((btn) => {
    btn.classList.remove("ring-2", "bg-gray-50");
  });
  const btn = document.querySelector(
    `.severity-btn[data-val="${level}"]`
  );
  btn.classList.add("ring-2");
}

// VERIFICATION TABS LOGIC
/**
 * Sets the verification mode
 * @param {string} mode The verification mode
 */
function setVerificationMode(mode) {
  currentVerificationMode = mode;

  // Reset Tab Styles
  ["photo", "sensor", "sms"].forEach((m) => {
    const btn = document.getElementById(`tab-${m}`);
    const content = document.getElementById(`content-${m}`);

    // Style Reset
    btn.classList.remove(
      "bg-gray-100",
      "text-green-700",
      "ring-2",
      "ring-green-700"
    );
    btn.classList.add("bg-white", "text-gray-900");

    // Content visibility
    if (m === mode) {
      content.classList.remove("hidden");
      content.classList.add("block");
      btn.classList.add(
        "bg-gray-100",
        "text-green-700",
        "ring-2",
        "ring-green-700"
      );
      btn.classList.remove("bg-white", "text-gray-900");
    } else {
      content.classList.add("hidden");
      content.classList.remove("block");
    }
  });
}

/**
 * Handles the file input
 * @param {HTMLInputElement} input The file input
 */
function handleFile(input) {
  if (input.files.length > 0) {
    document.getElementById("file-name").classList.remove("hidden");
  }
}

/**
 * Runs the sensor check
 */
function runSensorCheck() {
  const btn = document.getElementById("sensor-btn");
  btn.innerHTML =
    '<i class="fa-solid fa-spinner animate-spin"></i> Analyzing...';

  // Simulation
  setTimeout(() => {
    btn.innerHTML =
      '<i class="fa-solid fa-fingerprint"></i> Check Complete';
    btn.classList.add(
      "bg-green-50",
      "text-green-700",
      "border-green-200"
    );
    document.getElementById("sensor-result").classList.remove("hidden");
    sensorVerified = true;
  }, 1500);
}

/**
 * Cancels the report
 */
function cancelReport() {
  document.getElementById("user-form").classList.add("hidden");
  document.getElementById("user-home").classList.remove("hidden");
}

/**
 * Submits the report
 */
function submitReport() {
  if (!selectedSeverityLevel) {
    alert("Please select a water level severity.");
    return;
  }

  let urgency = "Low";
  if (selectedSeverityLevel === "high") urgency = "Critical";
  else if (selectedSeverityLevel === "med") urgency = "Moderate";

  const newReport = {
    id: Date.now(),
    timestamp: new Date().toLocaleTimeString(),
    lat: appState.currentUserLat || 14.5995,
    lng: appState.currentUserLng || 120.9842,
    accuracy: appState.currentUserAccuracy || 15,
    severity: selectedSeverityLevel,
    urgency: urgency,
    people: document.getElementById("people-count").value,
    status: "PENDING",
    verificationType: currentVerificationMode, // Store the method
    hasPhoto: document.getElementById("file-input").files.length > 0,
    sensorVerified: sensorVerified,
  };

  appState.reports.push(newReport);

  document.getElementById("user-form").classList.add("hidden");
  document.getElementById("user-status").classList.remove("hidden");

  startUserStatusListener(newReport.id);
}

// --- ADMIN FLOW ---

/**
 * Renders the admin feed
 */
function renderAdminFeed() {
  const container = document.getElementById("admin-feed");
  container.innerHTML = "";

  // Clear existing markers
  if (adminMap) {
    adminMap.eachLayer((layer) => {
      if (layer instanceof L.Marker) {
        adminMap.removeLayer(layer);
      }
    });
  }

  const sortedReports = [...appState.reports].sort((a, b) => {
    const priority = { Critical: 3, Moderate: 2, Low: 1 };
    return priority[b.urgency] - priority[a.urgency];
  });

  if (sortedReports.length === 0) {
    container.innerHTML =
      '<p class="text-center text-gray-400 text-sm mt-10">No active reports.</p>';
    if (adminMap) {
      adminMap.setView([12.8797, 121.774], 5);
    }
    return;
  }

  const reportPositions = [];

  sortedReports.forEach((report) => {
    reportPositions.push([report.lat, report.lng]);

    // Add marker to the map
    if (adminMap) {
      const marker = L.marker([report.lat, report.lng]).addTo(adminMap);
      marker.bindPopup(`<b>Report #${report.id.toString().slice(-4)}</b><br>Severity: ${report.severity}`);
    }

    const isLocationVerified = report.accuracy <= 20;
    const locationBadge = isLocationVerified
      ? `<span class="text-[10px] bg-green-100 text-green-700 px-1 rounded border border-green-200"><i class="fa-solid fa-crosshairs"></i> GPS Verified</span>`
      : `<span class="text-[10px] bg-yellow-100 text-yellow-700 px-1 rounded border border-yellow-200"><i class="fa-solid fa-circle-question"></i> Low Accuracy</span>`;

    const severityColors = {
      high: "border-l-4 border-l-red-500",
      med: "border-l-4 border-l-orange-400",
      low: "border-l-4 border-l-yellow-400",
    };

    const nearestSite = findNearestSite(report.lat, report.lng);
    const mapsLink = `https://www.google.com/maps/dir/?api=1&origin=${report.lat},${report.lng}&destination=${nearestSite.lat},${nearestSite.lng}`;

    let actionButton = "";
    if (report.status === "PENDING") {
      actionButton = `<button onclick="updateStatus(${report.id}, 'DISPATCHED')" class="bg-green-600 text-white text-xs font-bold py-2 px-3 rounded hover:bg-green-700 w-full mt-2">DISPATCH TEAM</button>`;
    } else if (report.status === "DISPATCHED") {
      actionButton = `<button class="bg-green-600 text-white text-xs font-bold py-2 px-3 rounded cursor-default w-full mt-2"><i class="fa-solid fa-check"></i> TEAM ACTIVE</button>`;
    }

    // Determine Validation Icon/Text
    let validationDisplay = "";
    if (report.verificationType === "photo") {
      validationDisplay = report.hasPhoto
        ? '<p class="text-xs text-green-600 mb-2"><i class="fa-solid fa-image"></i> Photo Evidence Attached</p>'
        : '<p class="text-xs text-red-500 mb-2"><i class="fa-solid fa-triangle-exclamation"></i> No Photo Uploaded</p>';
    } else if (report.verificationType === "sensor") {
      validationDisplay = report.sensorVerified
        ? '<p class="text-xs text-purple-600 mb-2"><i class="fa-solid fa-fingerprint"></i> Sensor Biometrics Verified</p>'
        : '<p class="text-xs text-gray-400 mb-2"><i class="fa-solid fa-ban"></i> Sensor Check Skipped</p>';
    } else if (report.verificationType === "sms") {
      validationDisplay =
        '<p class="text-xs text-orange-600 mb-2"><i class="fa-solid fa-comment-sms"></i> SMS Callback Requested</p>';
    }

    const card = `
              <div class="bg-white p-4 rounded-lg shadow-sm border ${
                severityColors[report.severity]
              }">
                  <div class="flex justify-between items-start mb-2">
                      <div>
                          <h3 class="font-bold text-gray-800">#${report.id
                            .toString()
                            .slice(
                              -4
                            )} <span class="text-xs font-normal text-gray-500">(${
      report.timestamp
    })</span></h3>
                          <div class="flex gap-1 mt-1">
                              <span class="text-[10px] uppercase bg-stone-100 px-1 rounded font-bold tracking-wider">${
                                report.urgency
                              }</span>
                              ${locationBadge}
                          </div>
                      </div>
                      <div class="text-right">
                          <a href="${mapsLink}" target="_blank" class="text-green-500 text-xs hover:underline"><i class="fa-solid fa-map-location-dot"></i> View Route</a>
                      </div>
                  </div>
                  
                  <div class="text-sm text-gray-600 mb-3 grid grid-cols-2 gap-2">
                      <div class="bg-gray-50 p-2 rounded">
                          <p class="text-xs text-gray-400">Severity</p>
                          <p class="font-bold capitalize">${
                            report.severity === "high"
                              ? "High"
                              : report.severity
                          }</p>
                      </div>
                       <div class="bg-gray-50 p-2 rounded">
                          <p class="text-xs text-gray-400">People</p>
                          <p class="font-bold">${report.people}</p>
                      </div>
                  </div>

                  ${validationDisplay}
                  
                  ${actionButton}
              </div>
          `;
    container.innerHTML += card;
  });

  if (adminMap && reportPositions.length > 0) {
    adminMap.fitBounds(reportPositions, { padding: [50, 50] });
  }
}

/**
 * Updates the status of a report
 * @param {number} id The id of the report
 * @param {string} newStatus The new status of the report
 */
function updateStatus(id, newStatus) {
  const report = appState.reports.find((r) => r.id === id);
  if (report) {
    report.status = newStatus;
    renderAdminFeed();
    alert(`Team dispatched to Incident #${id}`);
  }
}

/**
 * Starts the user status listener
 * @param {number} reportId The id of the report
 */
function startUserStatusListener(reportId) {
  const interval = setInterval(() => {
    const report = appState.reports.find((r) => r.id === reportId);

    if (report && report.status === "DISPATCHED") {
      document
        .getElementById("status-icon-container")
        .classList.remove("bg-yellow-100");
      document
        .getElementById("status-icon-container")
        .classList.add("bg-green-100");

      document.getElementById("status-icon").className =
        "fa-solid fa-life-ring text-green-600 text-4xl";
      document.getElementById("status-title").innerText =
        "Help is on the Way!";
      document.getElementById("status-desc").innerText =
        "A response team has been dispatched to your location.";

      document
        .getElementById("step-verified")
        .classList.remove("opacity-40");
      document
        .getElementById("step-dispatched")
        .classList.remove("opacity-40");
      document
        .getElementById("step-dispatched")
        .querySelector(".bg-gray-300")
        .classList.add("bg-green-500", "text-white");
      document
        .getElementById("step-dispatched")
        .querySelector(".bg-gray-300")
        .classList.remove("bg-gray-300");

      document.getElementById("arrival-msg").classList.remove("hidden");

      clearInterval(interval);
    }
  }, 1000);
}

function viewRoute() {
  const lat = appState.currentUserLat;
  const lon = appState.currentUserLng;

  if (lat && lon) {
    window.location.href = `evacuation.html?lat=${lat}&lon=${lon}`;
    return;
  }

  if ("geolocation" in navigator) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        window.location.href = `evacuation.html?lat=${lat}&lon=${lon}`;
      },
      (error) => {
        alert("Could not get your location. Please enable GPS and try again.");
      }
    );
  } else {
    alert("Geolocation is not supported by this browser.");
  }
}