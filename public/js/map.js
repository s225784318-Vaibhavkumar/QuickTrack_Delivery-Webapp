// Extract session ID from URL
const urlParams = new URLSearchParams(window.location.search);
const sessionId = urlParams.get('session');

const trackingUI = document.getElementById('trackingUI');
const errorArea = document.getElementById('errorArea');
const sessIdDisplay = document.getElementById('sessIdDisplay');
const customerStatus = document.getElementById('customerStatus');
const lastUpdated = document.getElementById('lastUpdated');

let map;
let driverMarker;

if (!sessionId) {
    errorArea.classList.remove('hidden');
} else {
    initCustomerTracking();
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
        
        // Setup UI
        sessIdDisplay.textContent = sessionId;
        trackingUI.classList.remove('hidden');
        customerStatus.textContent = sessionData.status;
        if (sessionData.status === 'Delivered') {
            customerStatus.classList.add('delivered');
        }

        // Initialize Map (Centered globally until first coordinate)
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

        // Setup Socket.io
        const socket = io();
        
        socket.on('connect', () => {
            console.log('Connected to socket server');
            socket.emit('join_session', sessionId);
        });

        // Handle incoming location updates
        socket.on('location_update', (data) => {
            const { lat, lng, timestamp } = data;
            
            // First time getting location
            if (!driverMarker) {
                driverMarker = L.marker([lat, lng], { icon: vehicleIcon }).addTo(map);
                map.setView([lat, lng], 15);
            } else {
                // Smoothly animate marker to new position (Leaflet usually snaps, but we setLatLng)
                driverMarker.setLatLng([lat, lng]);
                map.panTo([lat, lng]);
            }
            
            customerStatus.textContent = 'In-Transit';
            customerStatus.classList.remove('delivered');
            
            const time = new Date(timestamp).toLocaleTimeString();
            lastUpdated.textContent = `Last updated: ${time}`;
        });

        socket.on('delivery_status_update', (data) => {
            if (data.status === 'Delivered') {
                customerStatus.textContent = 'Delivered';
                customerStatus.classList.add('delivered');
                lastUpdated.textContent = 'Delivery completed. Driver stopped sharing location.';
            }
        });

    } catch (err) {
        errorArea.classList.remove('hidden');
        console.error(err);
    }
}
