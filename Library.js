(function(global) {
    console.log(" [Library] Loading 3D Engine v2.0 (Mountains)...");

    // --- LIBRARY CONFIGURATION ---
    const CONFIG = {
        threeCDN: "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js",
        orbitCDN: "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"
    };

    // --- UTILS & NOISE ENGINE (Internal) ---
    const Noise = (function() {
        const perm = new Uint8Array(512);
        const p = new Uint8Array(256);
        for(let i=0; i<256; i++) p[i] = i;
        for(let i=0; i<256; i++) {
            let r = Math.floor(Math.random()*256);
            let t = p[i]; p[i] = p[r]; p[r] = t;
        }
        for(let i=0; i<512; i++) perm[i] = p[i & 255];
        const grad3 = [[1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],[1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],[0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]];
        function dot(g, x, y) { return g[0]*x + g[1]*y; }
        function simplex2(x, y) {
            const F2 = 0.5*(Math.sqrt(3.0)-1.0);
            const G2 = (3.0-Math.sqrt(3.0))/6.0;
            let n0, n1, n2;
            let s = (x+y)*F2;
            let i = Math.floor(x+s), j = Math.floor(y+s);
            let t = (i+j)*G2;
            let X0 = i-t, Y0 = j-t;
            let x0 = x-X0, y0 = y-Y0;
            let i1, j1;
            if(x0>y0) {i1=1; j1=0;} else {i1=0; j1=1;}
            let x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
            let x2 = x0 - 1.0 + 2.0*G2, y2 = y0 - 1.0 + 2.0*G2;
            let ii = i & 255, jj = j & 255;
            let gi0 = perm[ii+perm[jj]] % 12;
            let gi1 = perm[ii+i1+perm[jj+j1]] % 12;
            let gi2 = perm[ii+1+perm[jj+1]] % 12;
            let t0 = 0.5 - x0*x0 - y0*y0;
            if(t0<0) n0 = 0.0; else {t0 *= t0; n0 = t0 * t0 * dot(grad3[gi0], x0, y0);}
            let t1 = 0.5 - x1*x1 - y1*y1;
            if(t1<0) n1 = 0.0; else {t1 *= t1; n1 = t1 * t1 * dot(grad3[gi1], x1, y1);}
            let t2 = 0.5 - x2*x2 - y2*y2;
            if(t2<0) n2 = 0.0; else {t2 *= t2; n2 = t2 * t2 * dot(grad3[gi2], x2, y2);}
            return 70.0 * (n0 + n1 + n2);
        }
        return {
            fbm: function(x, y, seed, octaves, persistence, scale) {
                let total = 0; let f = scale; let a = 1; let m = 0;
                for(let i=0; i<octaves; i++) {
                    total += simplex2((x+seed)*f, (y+seed)*f) * a; m += a; a *= persistence; f *= 2;
                }
                return total / m;
            },
            ridged: function(x, y, seed, octaves, scale) {
                let total = 0; let f = scale; let a = 1; let w = 1.0;
                for(let i=0; i<octaves; i++) {
                    let n = 1.0 - Math.abs(simplex2((x+seed)*f, (y+seed)*f));
                    n = n * n * n; total += n * a * w; w = n; a *= 0.5; f *= 2;
                }
                return total;
            }
        };
    })();

    // Internal state
    let isRunning = false;
    let scene, camera, renderer, controls;
    let tileGroup, raycaster, mouse;
    let uiElements = {};
    let intersectedTile = null;
    let tileRegistry = {}; // Look up tiles by ID "C_X_Z"
    let mountainAssets = []; // Stores the 5 generated prototypes

    // Game Constants
    const TILE_SIZE = 2;
    const CHUNK_SIZE = 10;
    const COLORS = { BASE: 0xC2B280, HOVER: 0x8B4513, BORDER: 0x000000 };

    // --- DEPENDENCY LOADING ---
    function loadScript(src) {
        return new Promise((resolve, reject) => {
            if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
            const script = document.createElement('script');
            script.src = src;
            script.crossOrigin = "anonymous";
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    function waitForDOM() {
        return new Promise(resolve => {
            if (document.body || document.readyState === 'complete') resolve();
            else window.addEventListener('DOMContentLoaded', resolve);
        });
    }

    // --- ASSET GENERATION (MOUNTAINS) ---
    const AssetGenerator = {
        generatePrototypes() {
            console.log(" [Library] Generating Mountain Prototypes...");
            for(let i=1; i<=5; i++) {
                mountainAssets.push(this.createMountainMesh(i));
            }
        },

        createMountainMesh(type) {
            const segments = 120; // High detail
            const size = TILE_SIZE * 0.95; // Fit inside tile
            const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
            geometry.rotateX(-Math.PI / 2); // Lay flat
            
            const pos = geometry.attributes.position;
            const seed = Math.random() * 100;

            for(let i=0; i<pos.count; i++) {
                const x = pos.getX(i);
                const z = pos.getZ(i);
                const dist = Math.sqrt(x*x + z*z);
                
                // --- Shape Logic ---
                let mask = 0, nAmp = 1, nScale = 1;
                
                if (type === 1) { // Classic
                    mask = Math.pow(Math.max(0, 1.0 - dist), 1.5);
                    nAmp = 1.2;
                } else if (type === 2) { // Ridge
                    const d = Math.sqrt((x*x)*4.0 + z*z); 
                    mask = Math.max(0, 1.0 - d);
                    nAmp = 1.4; nScale = 0.8;
                } else if (type === 3) { // Massif
                    mask = Math.pow(Math.max(0, 1.0 - Math.max(Math.abs(x), Math.abs(z))), 0.5);
                    nAmp = 1.0; nScale = 1.2;
                } else if (type === 4) { // Twin
                    const d1 = Math.sqrt(Math.pow(x-0.4, 2) + z*z);
                    const d2 = Math.sqrt(Math.pow(x+0.4, 2) + z*z);
                    mask = Math.max(Math.max(0, 0.9 - d1), Math.max(0, 0.9 - d2));
                    nAmp = 1.3;
                } else if (type === 5) { // Volcano
                    let d = Math.sqrt(x*x + z*z);
                    mask = Math.max(0, 1.0 - d);
                    if (d < 0.3) mask -= (0.3 - d) * 2.0;
                    mask = Math.max(0, mask);
                    nAmp = 0.8; nScale = 1.5;
                }

                // --- Noise ---
                let n = Noise.ridged(x, z, seed, 4, nScale);
                let baseN = Noise.fbm(x, z, seed+100, 2, 0.5, 0.5);
                let h = mask * 1.5 + (mask * n * 0.5 * nAmp) + (mask * baseN * 0.2);
                pos.setY(i, h);
            }

            geometry.computeVertexNormals();
            
            // --- Coloring ---
            const colors = [];
            const normals = geometry.attributes.normal;
            const cGrass = new THREE.Color(0x3a4f3a);
            const cRock = new THREE.Color(0x5a5048);
            const cSteep = new THREE.Color(0x2b241d);
            const cPeak = new THREE.Color(0x8f857d);

            for(let i=0; i<pos.count; i++) {
                const y = pos.getY(i);
                const slope = normals.getY(i);
                let col = new THREE.Color();

                if (y < 0.1) col.copy(cGrass).lerp(cRock, y * 10);
                else {
                    if (slope > 0.7) col.copy(cRock).lerp(cPeak, 0.5);
                    else if (slope < 0.3) col.copy(cSteep);
                    else col.copy(cRock);
                }
                const band = Math.sin(y * 25 + Noise.fbm(pos.getX(i), pos.getZ(i), seed, 2, 0.5, 2.0));
                if (band > 0.9) col.multiplyScalar(0.8);
                colors.push(col.r, col.g, col.b);
            }
            geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

            const material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9, metalness: 0.1 });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.castShadow = true; 
            mesh.receiveShadow = true;
            return mesh;
        }
    };

    // --- ENGINE CORE ---
    const Engine = {
        
        async init() {
            if (isRunning) return;
            isRunning = true;
            await waitForDOM();

            // Setup UI
            this.setupDOM();

            // Load Deps
            if (typeof THREE === 'undefined') await loadScript(CONFIG.threeCDN);
            if (!THREE.OrbitControls) await loadScript(CONFIG.orbitCDN);

            // Generate Assets
            AssetGenerator.generatePrototypes();

            // Setup Scene
            this.setupScene();
            
            // Generate First Chunk
            this.generateChunk(1, -(CHUNK_SIZE * TILE_SIZE) / 2, -(CHUNK_SIZE * TILE_SIZE) / 2);
            
            this.startLoop();
        },

        setupDOM() {
            const style = document.createElement('style');
            style.textContent = `body{margin:0;overflow:hidden;background:#1a1a1a;} #lib-ui{position:absolute;top:20px;left:20px;color:white;background:rgba(0,0,0,0.7);padding:15px;border:1px solid #444;font-family:sans-serif;pointer-events:none;}`;
            document.head.appendChild(style);
            const ui = document.createElement('div');
            ui.id = 'lib-ui';
            ui.innerHTML = `<h3>System Status</h3><div>Chunk: <span id='l-c'>--</span></div><div>Loc: <span id='l-l'>--</span></div>`;
            document.body.appendChild(ui);
            uiElements.chunk = document.getElementById('l-c');
            uiElements.loc = document.getElementById('l-l');
        },

        setupScene() {
            scene = new THREE.Scene();
            scene.background = new THREE.Color(0x87CEEB);
            scene.fog = new THREE.Fog(0x87CEEB, 20, 60);
            camera = new THREE.PerspectiveCamera(45, window.innerWidth/window.innerHeight, 0.1, 1000);
            camera.position.set(0, 25, 25);
            camera.lookAt(0,0,0);
            renderer = new THREE.WebGLRenderer({antialias:true});
            renderer.setSize(window.innerWidth, window.innerHeight);
            renderer.shadowMap.enabled = true;
            document.body.appendChild(renderer.domElement);
            scene.add(new THREE.AmbientLight(0xffffff, 0.5));
            const sun = new THREE.DirectionalLight(0xffffff, 0.8);
            sun.position.set(10,20,10); sun.castShadow = true; scene.add(sun);
            controls = new THREE.OrbitControls(camera, renderer.domElement);
            tileGroup = new THREE.Group(); scene.add(tileGroup);
            raycaster = new THREE.Raycaster(); mouse = new THREE.Vector2();
            window.addEventListener('mousemove', e => { mouse.x=(e.clientX/window.innerWidth)*2-1; mouse.y=-(e.clientY/window.innerHeight)*2+1; });
            window.addEventListener('resize', () => { camera.aspect=window.innerWidth/window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth,window.innerHeight); });
        },

        createTile(x, z, localX, localZ, chunkId) {
            const geo = new THREE.BoxGeometry(TILE_SIZE-0.05, 0.2, TILE_SIZE-0.05);
            const mat = new THREE.MeshLambertMaterial({color: COLORS.BASE});
            const tile = new THREE.Mesh(geo, mat);
            tile.position.set(x, 0, z);
            tile.userData = { chunkId: chunkId, gridLocation: {x: localX, z: localZ}, originalColor: COLORS.BASE };
            
            // Border
            const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({color: COLORS.BORDER}));
            tile.add(edges);
            tileGroup.add(tile);

            // Register for lookup
            const key = `${chunkId}_${localX}_${localZ}`;
            tileRegistry[key] = tile;
        },

        generateChunk(id, ox, oz) {
            for(let r=1; r<=CHUNK_SIZE; r++) {
                for(let c=1; c<=CHUNK_SIZE; c++) {
                    this.createTile(ox+(c-1)*TILE_SIZE, oz+(r-1)*TILE_SIZE, c, r, id);
                }
            }
        },

        // --- MAP PARSER ---
        parseMapCommand(text) {
            console.log(" [Library] Parsing Map Command...");
            try {
                // Remove whitespace/newlines for easier regex
                const cleanText = text.replace(/\n/g, " ").trim();
                
                // Extract Content between <TileMap> tags
                const tagMatch = cleanText.match(/<TileMap>(.*?)<\/TileMap>/i);
                if (!tagMatch) return;
                
                const content = tagMatch[1];
                
                // Find Chunk ID
                const chunkMatch = content.match(/Chunk\s*=\s*(\d+)/i);
                if (!chunkMatch) { console.warn("No Chunk ID found"); return; }
                const chunkId = chunkMatch[1];

                // Find Locations (M : ...)
                // Regex looks for "Location = M : " followed by coords
                const locMatch = content.match(/Location\s*=\s*M\s*:\s*([0-9,\|]+)/i);
                
                if (locMatch) {
                    const coordString = locMatch[1];
                    const coords = coordString.split('|');
                    
                    coords.forEach(pair => {
                        const [tx, tz] = pair.split(',').map(n => n.trim());
                        this.addMountainToTile(chunkId, tx, tz);
                    });
                }

            } catch(e) {
                console.error(" [Library] Map Parse Error:", e);
            }
        },

        addMountainToTile(chunkId, x, z) {
            const key = `${chunkId}_${x}_${z}`;
            const tile = tileRegistry[key];
            if (!tile) {
                console.warn(` [Library] Tile not found: ${key}`);
                return;
            }

            // Check if already has mountain
            if (tile.userData.hasMountain) return;

            // Pick Random Mountain Prototype (0 to 4)
            const typeIndex = Math.floor(Math.random() * 5);
            const prototype = mountainAssets[typeIndex];

            // Clone mesh
            const mountain = prototype.clone();
            
            // Adjust position relative to tile
            // Tile is at y=0, height=0.2. Mountain base should be at 0.1
            mountain.position.set(0, 0.1, 0); 
            
            // Random rotation for variety
            mountain.rotation.y = Math.random() * Math.PI * 2;

            tile.add(mountain);
            tile.userData.hasMountain = true;
            console.log(` [Library] Added Mountain (Type ${typeIndex+1}) at ${key}`);
        },

        startLoop() {
            const animate = () => {
                requestAnimationFrame(animate);
                controls.update();
                raycaster.setFromCamera(mouse, camera);
                const intersects = raycaster.intersectObjects(tileGroup.children);
                if(intersects.length > 0) {
                    const obj = intersects[0].object;
                    if(intersectedTile !== obj) {
                        if(intersectedTile) intersectedTile.material.color.setHex(intersectedTile.userData.originalColor);
                        intersectedTile = obj;
                        intersectedTile.material.color.setHex(COLORS.HOVER);
                        uiElements.chunk.innerText = obj.userData.chunkId;
                        uiElements.loc.innerText = `${obj.userData.gridLocation.x},${obj.userData.gridLocation.z}`;
                    }
                } else if(intersectedTile) {
                    intersectedTile.material.color.setHex(intersectedTile.userData.originalColor);
                    intersectedTile = null;
                }
                renderer.render(scene, camera);
            };
            animate();
        }
    };

    // --- EXPOSE API ---
    
    // 1. Protocol Listener (Start)
    let pVal = "";
    Object.defineProperty(global, 'Protocol', {
        get: () => pVal,
        set: (v) => { pVal = v; if(v==="Start") Engine.init(); }
    });

    // 2. MapData Listener (AI Commands)
    let mVal = "";
    Object.defineProperty(global, 'GameData', {
        get: () => mVal,
        set: (v) => { 
            mVal = v; 
            Engine.parseMapCommand(v); 
        }
    });

    global.ChunkGameLib = { init: () => Engine.init() };

})(window);
