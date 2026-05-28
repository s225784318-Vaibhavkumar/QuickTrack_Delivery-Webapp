// Extract session ID from URL
const urlParams = new URLSearchParams(window.location.search);
const sessionId = urlParams.get('session');

const trackingUI = document.getElementById('trackingUI');
const errorArea = document.getElementById('errorArea');
const sessIdDisplay = document.getElementById('sessIdDisplay');
const customerStatus = document.getElementById('customerStatus');
const lastUpdated = document.getElementById('lastUpdated');

// Dynamic Cards DOM
const etaTime = document.getElementById('etaTime');
const distanceText = document.getElementById('distanceText');
const driverNameText = document.getElementById('driverName');
const vehicleDetailsText = document.getElementById('vehicleDetails');
const connBanner = document.getElementById('connBanner');
const connBannerText = document.getElementById('connBannerText');

let map;
let driverMarker;
let customerDestination = null; // Customer destination coordinates
let destMarker;

if (!sessionId) {
    errorArea.classList.remove('hidden');
} else {
    initCustomerTracking();
}

// Haversine formula to calculate distance between two coordinates in kilometers
function getHaversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// Calculate ETA based on distance
function updateETAAndDistance(driverLat, driverLng) {
    if (!customerDestination) return;

    const distanceKm = getHaversineDistance(driverLat, driverLng, customerDestination.lat, customerDestination.lng);
    
    // Average vehicle speed in urban area (40 km/h)
    const averageSpeedKmh = 40;
    const travelTimeHours = distanceKm / averageSpeedKmh;
    const travelTimeMinutes = Math.round(travelTimeHours * 60);

    // Update UI elements
    distanceText.textContent = `📍 Distance remaining: ${distanceKm.toFixed(2)} km`;
    
    if (distanceKm <= 0.05) {
        etaTime.textContent = '📦 Arriving Now';
        etaTime.classList.add('arrived-green');
    } else {
        etaTime.textContent = `~ ${travelTimeMinutes} mins`;
        etaTime.classList.remove('arrived-green');
    }
}

async function initCustomerTracking() {
    try {
        // Fetch session status to ensure it exists
        const res = await fetch(`/api/session/${sessionId}`);
        if (!res.ok) {
            errorArea.classList.remove('hidden');
            return;
        }
        
        const sessionData = await res.json();
        
        // Setup UI Meta
        sessIdDisplay.textContent = sessionId;
        trackingUI.classList.remove('hidden');
        customerStatus.textContent = sessionData.status;
        
        if (sessionData.status === 'Delivered') {
            customerStatus.textContent = 'Delivered';
            customerStatus.className = 'status-badge delivered';
            etaTime.textContent = '📦 Package Delivered';
            distanceText.textContent = 'Delivery complete';
        }

        // Render Driver Profile Card
        if (sessionData.driverId) {
            driverNameText.textContent = sessionData.driverId.name;
            vehicleDetailsText.textContent = sessionData.driverId.vehicleDetails || 'Standard Delivery Vehicle';
        } else {
            driverNameText.textContent = 'Courier assigned';
            vehicleDetailsText.textContent = 'Standard Vehicle';
        }

        // Initialize Leaflet Map (Centered globally initially)
        map = L.map('map').setView([0, 0], 2);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; OpenStreetMap contributors & CARTO',
            maxZoom: 19
        }).addTo(map);

        // Custom Vehicle Icon
        const vehicleIcon = L.icon({
            iconUrl: 'https://cdn-icons-png.flaticon.com/512/711/711244.png',
            iconSize: [40, 40],
            iconAnchor: [20, 20]
        });

        // Custom Customer Home Icon
        const homeIcon = L.icon({
            iconUrl: 'https://cdn-icons-png.flaticon.com/512/619/619153.png',
            iconSize: [35, 35],
            iconAnchor: [17, 35]
        });

        // Setup Socket.io Client
        const socket = io({
            reconnection: true,
            reconnectionAttempts: 10,
            reconnectionDelay: 1000
        });
        
        socket.on('connect', () => {
            connBanner.classList.add('hidden');
            console.log('Connected to socket server');
            socket.emit('join_session', sessionId);
        });

        socket.on('disconnect', () => {
            console.warn('Socket network connection drop');
            connBannerText.textContent = '⚠️ Reconnecting to server...';
            connBanner.classList.remove('hidden');
        });

        // Handle incoming location updates
        socket.on('location_update', (data) => {
            const { lat, lng, timestamp } = data;
            
            // Generate a persistent simulated destination coordinate 3km north-east on the first coordinate
            if (!customerDestination) {
                customerDestination = {
                    lat: lat + 0.02, // approx 2.2km north
                    lng: lng + 0.02  // approx 2.2km east
                };

                // Place destination home marker on map
                destMarker = L.marker([customerDestination.lat, customerDestination.lng], { icon: homeIcon }).addTo(map);
                destMarker.bindPopup('<b>Your Delivery Address</b>').openPopup();
            }

            // Render/Move Driver Marker
            if (!driverMarker) {
                driverMarker = L.marker([lat, lng], { icon: vehicleIcon }).addTo(map);
                // Adjust viewport bounding box to fit both markers
                const bounds = L.latLngBounds([
                    [lat, lng],
                    [customerDestination.lat, customerDestination.lng]
                ]);
                map.fitBounds(bounds, { padding: [50, 50] });
            } else {
                driverMarker.setLatLng([lat, lng]);
            }
            
            customerStatus.textContent = 'In-Transit';
            customerStatus.className = 'status-badge in-transit';
            
            // Calculate dynamic ETA using core math engine
            updateETAAndDistance(lat, lng);

            const time = new Date(timestamp).toLocaleTimeString();
            lastUpdated.textContent = `Last update received: ${time}`;
        });

        socket.on('delivery_status_update', (data) => {
            if (data.status === 'Delivered') {
                customerStatus.textContent = 'Delivered';
                customerStatus.className = 'status-badge delivered';
                etaTime.textContent = '📦 Package Delivered';
                distanceText.textContent = 'Delivery complete';
                lastUpdated.textContent = 'Delivery completed. Driver stopped sharing location.';
            }
        });

    } catch (err) {
        errorArea.classList.remove('hidden');
        console.error(err);
    }
}
