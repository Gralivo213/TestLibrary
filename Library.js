(function(global) {
    console.log(" [Library] Loading 3D Engine...");

    // --- LIBRARY CONFIGURATION ---
    const CONFIG = {
        threeCDN: "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js",
        orbitCDN: "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"
    };

    // Internal state
    let isRunning = false;
    let scene, camera, renderer, controls;
    let tileGroup, raycaster, mouse;
    let uiElements = {};
    let intersectedTile = null;

    // Game Constants
    const TILE_SIZE = 2;
    const TILE_HEIGHT = 0.2;
    const CHUNK_SIZE = 10;
    const GAP = 0.05;
    const COLORS = {
        BASE: 0xC2B280,   // Sand
        HOVER: 0x8B4513,  // Dark Brown
        BORDER: 0x000000  // Black
    };

    // --- UTILITIES ---
    function loadScript(src) {
        return new Promise((resolve, reject) => {
            // Check if already exists
            if (document.querySelector(`script[src="${src}"]`)) {
                resolve();
                return;
            }
            console.log(` [Library] Fetching dependency: ${src}`);
            const script = document.createElement('script');
            script.src = src;
            script.onload = () => {
                console.log(` [Library] Dependency loaded: ${src}`);
                resolve();
            };
            script.onerror = (e) => {
                console.error(` [Library] Failed to load: ${src}`, e);
                reject(e);
            };
            document.head.appendChild(script);
        });
    }

    function waitForDOM() {
        return new Promise(resolve => {
            if (document.body) {
                resolve();
            } else {
                console.log(" [Library] Waiting for DOM...");
                window.addEventListener('DOMContentLoaded', resolve);
            }
        });
    }

    // --- ENGINE CORE ---
    const Engine = {
        
        async init() {
            if (isRunning) {
                console.log(" [Library] Engine already running.");
                return;
            }
            isRunning = true; // Prevent double firing
            console.log(" [Library] Initialization Triggered.");

            // 1. Wait for HTML Body to exist (Crucial fix)
            await waitForDOM();

            // 2. Ensure Dependencies are ready
            if (typeof THREE === 'undefined') {
                await loadScript(CONFIG.threeCDN);
            }
            if (typeof THREE.OrbitControls === 'undefined') {
                // Check if OrbitControls is inside THREE (newer versions) or separate
                if (!THREE.OrbitControls) { 
                    await loadScript(CONFIG.orbitCDN);
                }
            }

            console.log(" [Library] Dependencies ready. Starting Scene.");

            // 3. Start the Game
            this.setupDOM();
            this.setupScene();
            this.generateChunk(1, -(CHUNK_SIZE * TILE_SIZE) / 2, -(CHUNK_SIZE * TILE_SIZE) / 2);
            this.startLoop();
        },

        setupDOM() {
            // Inject Styles
            const style = document.createElement('style');
            style.textContent = `
                body { margin: 0; overflow: hidden; background-color: #1a1a1a; font-family: sans-serif; }
                #lib-ui-layer {
                    position: absolute; top: 20px; left: 20px; color: white;
                    background: rgba(0, 0, 0, 0.7); padding: 15px; border-radius: 8px;
                    pointer-events: none; border: 1px solid #444; min-width: 200px;
                    z-index: 9999;
                    font-family: 'Segoe UI', sans-serif;
                }
                #lib-ui-layer h1 { margin: 0 0 10px 0; font-size: 1.2rem; color: #ffd700; border-bottom: 1px solid #555; padding-bottom: 5px; }
                .lib-info-row { margin-bottom: 5px; font-size: 0.9rem; }
                .lib-highlight { color: #4db8ff; font-weight: bold; }
            `;
            document.head.appendChild(style);

            // Inject HTML UI
            const ui = document.createElement('div');
            ui.id = 'lib-ui-layer';
            ui.innerHTML = `
                <h1>System Status</h1>
                <div class="lib-info-row">Chunk ID: <span id="lib-chunk-display" class="lib-highlight">--</span></div>
                <div class="lib-info-row">Tile Coordinate: <span id="lib-coord-display" class="lib-highlight">--</span></div>
                <div class="lib-info-row">World Position: <span id="lib-world-display" class="lib-highlight">--</span></div>
                <div style="margin-top:10px; font-size: 0.8rem; color: #888;">Engine Active</div>
            `;
            document.body.appendChild(ui);

            // Cache UI references
            uiElements.chunk = document.getElementById('lib-chunk-display');
            uiElements.coord = document.getElementById('lib-coord-display');
            uiElements.world = document.getElementById('lib-world-display');
        },

        setupScene() {
            scene = new THREE.Scene();
            scene.background = new THREE.Color(0x87CEEB);
            scene.fog = new THREE.Fog(0x87CEEB, 20, 60);

            camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
            camera.position.set(0, 25, 25);
            camera.lookAt(0, 0, 0);

            renderer = new THREE.WebGLRenderer({ antialias: true });
            renderer.setSize(window.innerWidth, window.innerHeight);
            renderer.shadowMap.enabled = true;
            document.body.appendChild(renderer.domElement);

            // Lights
            const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
            scene.add(ambientLight);
            const dirLight = new THREE.DirectionalLight(0xffffff, 0.7);
            dirLight.position.set(10, 20, 10);
            dirLight.castShadow = true;
            scene.add(dirLight);

            // Controls
            controls = new THREE.OrbitControls(camera, renderer.domElement);
            controls.enableDamping = true;
            controls.dampingFactor = 0.05;
            controls.maxPolarAngle = Math.PI / 2.2;

            // Managers
            tileGroup = new THREE.Group();
            scene.add(tileGroup);
            raycaster = new THREE.Raycaster();
            mouse = new THREE.Vector2();

            // Event Listeners
            window.addEventListener('resize', this.onWindowResize, false);
            window.addEventListener('mousemove', this.onMouseMove, false);
        },

        createTile(x, z, localX, localZ, chunkId) {
            const geometry = new THREE.BoxGeometry(TILE_SIZE - GAP, TILE_HEIGHT, TILE_SIZE - GAP);
            const material = new THREE.MeshLambertMaterial({ color: COLORS.BASE });
            const tile = new THREE.Mesh(geometry, material);
            
            tile.position.set(x, 0, z);
            tile.castShadow = true;
            tile.receiveShadow = true;

            // Metadata
            tile.userData = {
                isTile: true,
                chunkId: chunkId,
                gridLocation: { x: localX, z: localZ },
                originalColor: COLORS.BASE
            };

            // Border
            const edgesGeo = new THREE.EdgesGeometry(geometry);
            const edges = new THREE.LineSegments(edgesGeo, new THREE.LineBasicMaterial({ color: COLORS.BORDER }));
            tile.add(edges);

            tileGroup.add(tile);
        },

        generateChunk(chunkId, worldOffsetX, worldOffsetZ) {
            console.log(`Generating Chunk ${chunkId}...`);
            for (let r = 1; r <= CHUNK_SIZE; r++) {
                for (let c = 1; c <= CHUNK_SIZE; c++) {
                    const xPos = worldOffsetX + (c - 1) * TILE_SIZE;
                    const zPos = worldOffsetZ + (r - 1) * TILE_SIZE;
                    this.createTile(xPos, zPos, c, r, chunkId);
                }
            }
        },

        onWindowResize() {
            if (!camera || !renderer) return;
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        },

        onMouseMove(event) {
            mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
            mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
        },

        handleHover() {
            if (!raycaster || !mouse || !camera || !tileGroup) return;

            raycaster.setFromCamera(mouse, camera);
            const intersects = raycaster.intersectObjects(tileGroup.children);

            if (intersects.length > 0) {
                const object = intersects[0].object;
                if (intersectedTile !== object) {
                    if (intersectedTile) intersectedTile.material.color.setHex(intersectedTile.userData.originalColor);
                    intersectedTile = object;
                    intersectedTile.material.color.setHex(COLORS.HOVER);
                    
                    // Update UI
                    const data = intersectedTile.userData;
                    if(uiElements.chunk) uiElements.chunk.innerText = data.chunkId;
                    if(uiElements.coord) uiElements.coord.innerText = `X: ${data.gridLocation.x}, Z: ${data.gridLocation.z}`;
                    if(uiElements.world) uiElements.world.innerText = `${Math.round(object.position.x)}, ${Math.round(object.position.z)}`;
                }
            } else {
                if (intersectedTile) {
                    intersectedTile.material.color.setHex(intersectedTile.userData.originalColor);
                    if(uiElements.chunk) uiElements.chunk.innerText = "--";
                    if(uiElements.coord) uiElements.coord.innerText = "--";
                    if(uiElements.world) uiElements.world.innerText = "--";
                }
                intersectedTile = null;
            }
        },

        startLoop() {
            const animate = () => {
                requestAnimationFrame(animate);
                if(controls) controls.update();
                this.handleHover();
                if(renderer && scene && camera) renderer.render(scene, camera);
            };
            animate();
        }
    };

    // --- EXPOSE API ---
    
    // 1. Capture existing value if user defined Protocol before script loaded
    let existingProtocol = global.Protocol;
    
    // 2. Define the Property with Getter/Setter
    let protocolValue = existingProtocol || "";
    
    Object.defineProperty(global, 'Protocol', {
        get: function() { return protocolValue; },
        set: function(v) { 
            console.log(" [Library] Protocol received:", v);
            protocolValue = v;
            if (v === "Start") {
                Engine.init();
            }
        },
        configurable: true
    });

    // 3. Expose Engine Methods
    global.ChunkGameLib = {
        init: () => Engine.init(),
        addChunk: (id, x, z) => Engine.generateChunk(id, x, z)
    };

    console.log(" [Library] Ready. Waiting for Protocol='Start'...");

    // 4. Trigger immediately if it was already set
    if (existingProtocol === "Start") {
        console.log(" [Library] Detected pre-set Protocol. Starting...");
        Engine.init();
    }

})(window);