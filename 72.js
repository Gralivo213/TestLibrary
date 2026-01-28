/**
 * IsoMapEngine Library v2.3 (High Quality Animation)
 * Features:
 * - Progressive Loading (Assets pop in).
 * - Step-by-Step Animation (Move -> Stop -> Move).
 * - Initial Delay (0.5s) before movement starts.
 * - Eased Interpolation (Smoother visual quality).
 * - UI Overlay: Movement Popup with Copy & Play Replay Button.
 */

(function (global) {
    // --- Configuration ---
    const CONFIG = {
        TILE_WIDTH: 64,
        TILE_HEIGHT: 32,
        TILE_THICKNESS: 12,
        CHUNK_SIZE: 10,
        COLORS: {
            TOP: '#e3c076',
            SIDE_LEFT: '#bfa163',
            SIDE_RIGHT: '#a38952',
            BORDER: '#1a1a1a',
            HOVER: 'rgba(0, 0, 0, 0.4)',

            // Highlight Colors
            HIGHLIGHT_BLUE: 'rgba(0, 140, 255, 0.6)',
            HIGHLIGHT_GOLD: 'rgba(255, 215, 0, 0.7)',
            SELECTION_CIRCLE: '#ffffff',

            // Placeholder Colors
            PLACEHOLDER_M: '#8b4513',
            PLACEHOLDER_H: '#228b22'
        },
        ANIMATION: {
            INITIAL_DELAY: 500, // ms to wait before starting
            MOVE_DURATION: 600, // ms to move one tile (Slower = smoother)
            STEP_DELAY: 200,    // ms to wait on tile after arriving
            STAGGER_DELAY: 100,
            FADE_DURATION: 300
        },
        ASSETS: {
            'M': [
                'https://raw.githubusercontent.com/Gralivo213/TestLibrary/main/imh/M1.png',
                'https://raw.githubusercontent.com/Gralivo213/TestLibrary/main/imh/M2.png',
                'https://raw.githubusercontent.com/Gralivo213/TestLibrary/main/imh/M3.png',
                'https://raw.githubusercontent.com/Gralivo213/TestLibrary/main/imh/M4.png'
            ],
            'H': [
                'https://raw.githubusercontent.com/Gralivo213/TestLibrary/main/imh/H1.png',
                'https://raw.githubusercontent.com/Gralivo213/TestLibrary/main/imh/H2.png',
                'https://raw.githubusercontent.com/Gralivo213/TestLibrary/main/imh/H3.png',
                'https://raw.githubusercontent.com/Gralivo213/TestLibrary/main/imh/H4.png',
                'https://raw.githubusercontent.com/Gralivo213/TestLibrary/main/imh/H5.png',
                'https://raw.githubusercontent.com/Gralivo213/TestLibrary/main/imh/H6.png',
                'https://raw.githubusercontent.com/Gralivo213/TestLibrary/main/imh/H7.png'
            ],
            'T': [
                'https://raw.githubusercontent.com/Gralivo213/TestLibrary/main/imh/Tree1.png',
                'https://raw.githubusercontent.com/Gralivo213/TestLibrary/main/imh/Tree2.png'
            ]
        },
        PLAYER_IMG: 'https://raw.githubusercontent.com/Gralivo213/TestLibrary/main/imh/P1.png'
    };

    // --- Asset Manager ---
    const AssetManager = {
        cache: new Map(),
        load(url) {
            if (this.cache.has(url)) return;
            this.cache.set(url, null);
            const img = new Image();
            img.crossOrigin = "Anonymous";
            img.src = url;
            img.onload = () => this.cache.set(url, img);
            img.onerror = () => this.cache.set(url, 'error');
        },
        get(url) {
            const asset = this.cache.get(url);
            if (asset === undefined) {
                this.load(url);
                return null;
            }
            if (asset === 'error') return null;
            return asset;
        }
    };

    // --- Engine ---
    class IsoGameEngine {
        constructor() {
            this.active = false;
            this.canvas = null;
            this.ctx = null;
            this.camera = { x: 0, y: 0, zoom: 1 };

            this.isDragging = false;
            this.lastMouse = { x: 0, y: 0 };
            this.mousePos = { x: 0, y: 0 };

            this.chunks = {};

            // Player Object with Detailed Animation State
            this.player = {
                chunkId: 1,
                lx: 0, ly: 0,
                prevLx: 0, prevLy: 0,
                visualLx: 0, visualLy: 0,

                // Animation State Machine
                isAnimating: false,
                animState: 'IDLE', // IDLE, INITIAL_DELAY, PREPARE_STEP, MOVING, PAUSED
                pathQueue: [],
                animTimer: 0,      // Timestamp marker
                startNode: null,   // {lx, ly} start of current step
                targetNode: null   // {lx, ly} end of current step
            };

            // --- State Management ---
            this.state = 'IDLE';
            this.validMoves = [];
            this.selectedPath = [];
            this.animStartTime = 0;
            this.herbData = {};
            this.treeData = {};

            // --- State Management ---
            this.state = 'IDLE';
            this.validMoves = [];
            this.selectedPath = [];
            this.animStartTime = 0;
            this.herbData = {};
            this.treeData = {};

            // Region System
            this.regions = [];
            this.showRegions = false;
            this.regionAnimStart = 0;

            // UI Elements
            this.ui = {
                popup: null,
                popupText: null,
                playBtn: null,
                regionBtn: null
            };
        }

        start() {
            if (this.active) return;
            this.active = true;
            this.createCanvas();
            this.createUI();

            this.generateChunk(1, 0, 0);
            this.camera.x = window.innerWidth / 2;
            this.camera.y = 100;

            this.attachEvents();
            this.loop();
            console.log("IsoGameEngine: Started v2.3");
        }

        createCanvas() {
            this.canvas = document.createElement('canvas');
            this.canvas.style.display = 'block';
            this.canvas.style.position = 'absolute';
            this.canvas.style.top = '0';
            this.canvas.style.left = '0';
            this.canvas.style.zIndex = '0';
            this.canvas.style.backgroundColor = '#222';
            document.body.appendChild(this.canvas);
            this.ctx = this.canvas.getContext('2d');
            this.resize();
        }

        createUI() {
            // 1. External Asset Injection (Tailwind & Material Icons)
            const tw = document.createElement('script');
            tw.src = "https://cdn.tailwindcss.com";
            document.head.appendChild(tw);

            const mat = document.createElement('link');
            mat.rel = "stylesheet";
            mat.href = "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap";
            document.head.appendChild(mat);

            // 2. Global Style Injection
            const style = document.createElement('style');
            style.textContent = `
.iso-stamina-container {
                    position: fixed; top: 20px; left: 40px;
                    z-index: 2000; transform: scale(0.25); transform-origin: top left;
                    pointer-events: auto; display: block !important; opacity: 1 !important;
                }
                                  .clip-octagon { clip-path: polygon(29.3% 0%, 70.7% 0%, 100% 29.3%, 100% 70.7%, 70.7% 100%, 29.3% 100%, 0% 70.7%, 0% 29.3%); }
                .clip-ink-stroke { clip-path: polygon(0% 12%, 5% 2%, 15% 5%, 25% 0%, 40% 6%, 55% 1%, 70% 5%, 85% 0%, 98% 8%, 100% 25%, 97% 40%, 100% 55%, 98% 70%, 100% 85%, 95% 98%, 80% 94%, 65% 100%, 50% 95%, 35% 100%, 20% 96%, 10% 100%, 2% 90%, 0% 75%, 4% 50%, 0% 25%); }
                .clip-ink-inner { clip-path: polygon(0% 15%, 5% 5%, 15% 8%, 25% 3%, 40% 9%, 55% 4%, 70% 8%, 85% 3%, 97% 10%, 99% 25%, 96% 40%, 99% 55%, 97% 70%, 99% 85%, 94% 97%, 80% 92%, 65% 98%, 50% 93%, 35% 98%, 20% 94%, 10% 98%, 3% 88%, 1% 75%, 5% 50%, 1% 25%); }

                .iso-ui-popup {
                    position: fixed; bottom: 20px; right: 20px;
                    background: rgba(30, 30, 30, 0.95); border: 1px solid #444; border-right: 4px solid #e3c076;
                    border-radius: 4px; padding: 10px 15px; color: #eee; font-family: monospace; font-size: 13px;
                    box-shadow: 0 4px 10px rgba(0,0,0,0.5); z-index: 10; display: none; align-items: center; gap: 10px;
                }
                .iso-ui-popup.visible { display: flex; }

                /* Reposition Icons to Bottom Left */
                .iso-play-btn {
                    position: fixed; bottom: 20px; left: 20px;
                    background: rgba(30, 30, 30, 0.9); border: 2px solid #e3c076; border-radius: 50%; width: 50px; height: 50px;
                    cursor: pointer; z-index: 10; display: flex; align-items: center; justify-content: center; transition: transform 0.1s;
                }
                .iso-sense-btn {
                    position: fixed; bottom: 20px; left: 80px;
                    background: rgba(30, 30, 30, 0.9); border: 2px solid #e3c076; border-radius: 50%; width: 50px; height: 50px;
                    cursor: pointer; z-index: 10; display: flex; align-items: center; justify-content: center; color: #e3c076; font-size: 24px;
                }
                .iso-region-btn {
                    position: fixed; bottom: 80px; left: 20px;
                    background: rgba(30, 30, 30, 0.9); border: 2px solid #555; border-radius: 50%; width: 50px; height: 50px;
                    cursor: pointer; z-index: 10; display: flex; align-items: center; justify-content: center; font-size: 24px; filter: grayscale(1) opacity(0.6);
                }
                .iso-region-btn.active { border-color: #e3c076; filter: grayscale(0) opacity(1); }
                .iso-play-icon { width: 0; height: 0; border-top: 10px solid transparent; border-bottom: 10px solid transparent; border-left: 18px solid #e3c076; margin-left: 4px; }
                
                .iso-herb-panel {
                    position: fixed; right: 0; top: 10vh; width: 24vw; height: 80vh; 
                    background: url('https://raw.githubusercontent.com/Gralivo213/TestLibrary/main/imh/HerbUI.png') no-repeat center center;
                    background-size: 100% 100%; z-index: 20; opacity: 0; transform: translateY(50px); pointer-events: none; transition: opacity 0.5s ease, transform 0.5s ease;
                }
                .iso-herb-panel.visible { opacity: 1; transform: translateY(0); pointer-events: auto; }
            `;
            document.head.appendChild(style);

            // 3. Build Stamina Bar UI (Top Left)
            const staminaBar = document.createElement('div');
            staminaBar.className = 'iso-stamina-container';
            staminaBar.style.cssText = "display: block !important; visibility: visible !important; opacity: 1 !important;";
            staminaBar.innerHTML = `
                <div class="relative flex items-center w-[900px] pointer-events-auto">
                    <div class="relative z-20 shrink-0 w-72 h-72 group">
                        <div class="absolute inset-0 bg-gradient-to-br from-gold-400 via-gold-700 to-gold-900 clip-octagon p-[4px] shadow-2xl">
                            <div class="w-full h-full bg-gradient-to-br from-jade-400 via-jade-800 to-jade-900 clip-octagon p-[4px]">
                                <div class="w-full h-full bg-black clip-octagon relative overflow-hidden cursor-pointer" id="stamina-img-box">
                                    <div id="stamina-img-display" class="absolute inset-0 bg-contain bg-no-repeat bg-center transition-all duration-300" 
                                         style="background-image: url('https://raw.githubusercontent.com/Gralivo213/TestLibrary/main/imh/WalkUI.png'); transform: scale(0.75);"></div>
                                    <div class="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="relative z-10 -ml-6 flex-grow h-32 flex items-center">
                        <div class="relative w-full h-24 filter drop-shadow-[0_10px_20px_rgba(0,0,0,0.8)]">
                            <div class="absolute inset-0 bg-black clip-ink-stroke transform scale-[1.02] translate-y-1"></div>
                            <div class="absolute inset-0 bg-gradient-to-r from-neutral-900 via-[#1a1d26] to-neutral-900 clip-ink-stroke border-l-4 border-gold-600/30">
                                <div class="absolute inset-[6px] clip-ink-inner overflow-hidden flex items-center">
                                    <div class="h-full w-[88%] bg-gradient-to-r from-blue-900 via-blue-500 to-cyan-400 shadow-[0_0_30px_#3b82f6]"></div>
                                </div>
                                <div class="absolute inset-0 flex items-center justify-between px-16 z-20 pointer-events-none">
                                    <span class="text-gold-400 font-bold text-4xl tracking-[0.2em]">STAMINA</span>
                                    <div class="flex items-baseline gap-2 text-white font-bold"><span class="text-5xl">88</span><span class="text-2xl text-slate-500">/ 100</span></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            document.body.prepend(staminaBar);

            // 4. Stamina Cycling Logic
            const modes = ['WalkUI.png', 'RunUI.png', 'SneakUI.png', 'HideUI.png'];
            let modeIdx = 0;
            const imgBox = document.getElementById('stamina-img-box');
            const imgDisplay = document.getElementById('stamina-img-display');
            imgBox.onclick = (e) => {
                e.stopPropagation();
                modeIdx = (modeIdx + 1) % modes.length;
                imgDisplay.style.backgroundImage = `url('https://raw.githubusercontent.com/Gralivo213/TestLibrary/main/imh/${modes[modeIdx]}')`;
                console.log("Stamina Mode:", modes[modeIdx]);
            };

            // 5. Existing Action Buttons (Repositioned via CSS)
            const playBtn = document.createElement('div');
            playBtn.className = 'iso-play-btn';
            playBtn.innerHTML = '<div class="iso-play-icon"></div>';
            playBtn.onclick = () => this.replayAnimation();
            document.body.appendChild(playBtn);
            this.ui.playBtn = playBtn;

            const regionBtn = document.createElement('div');
            regionBtn.className = 'iso-region-btn';
            regionBtn.innerHTML = '🗺️';
            regionBtn.onclick = () => {
                this.showRegions = !this.showRegions;
                regionBtn.classList.toggle('active', this.showRegions);
                if (this.showRegions) this.regionAnimStart = performance.now();
            };
            document.body.appendChild(regionBtn);
            this.ui.regionBtn = regionBtn;

            const senseBtn = document.createElement('div');
            senseBtn.className = 'iso-sense-btn';
            senseBtn.innerHTML = '👁️';
            senseBtn.onclick = () => this.triggerSense();
            document.body.appendChild(senseBtn);

            const herbPanel = document.createElement('div');
            herbPanel.className = 'iso-herb-panel';
            document.body.appendChild(herbPanel);
            this.ui.herbPanel = herbPanel;

            const popup = document.createElement('div');
            popup.className = 'iso-ui-popup';

            const popupText = document.createElement('span');
            popupText.textContent = "Waiting for input...";

            const copyBtn = document.createElement('button');
            copyBtn.className = 'iso-btn-icon';
            copyBtn.innerHTML = '📋';
            copyBtn.onclick = () => {
                navigator.clipboard.writeText(popupText.textContent).then(() => {
                    const original = copyBtn.innerHTML;
                    copyBtn.innerHTML = '✓';
                    setTimeout(() => copyBtn.innerHTML = original, 1000);
                });
            };

            popup.appendChild(popupText);
            popup.appendChild(copyBtn);
            document.body.appendChild(popup);

            this.ui.popup = popup;
            this.ui.popupText = popupText;
        }

        attachEvents() {
            window.addEventListener('resize', () => this.resize());
            this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
            window.addEventListener('mouseup', () => this.onMouseUp());
            window.addEventListener('mousemove', (e) => this.onMouseMove(e));
            this.canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
            this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
        }

        resize() {
            if (!this.canvas) return;
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
        }

        generateChunk(id, chunkX, chunkY) {
            for (let y = 0; y < CONFIG.CHUNK_SIZE; y++) {
                for (let x = 0; x < CONFIG.CHUNK_SIZE; x++) {
                    const gx = (chunkX * CONFIG.CHUNK_SIZE) + x;
                    const gy = (chunkY * CONFIG.CHUNK_SIZE) + y;
                    const key = `${gx},${gy}`;
                    if (!this.chunks[key]) {
                        this.chunks[key] = {
                            gx: gx, gy: gy,
                            lx: x + 1, ly: y + 1,
                            chunkId: id,
                            assetUrl: null, assetType: null,
                            assetHidden: false
                        };
                    }
                }
            }
        }

        triggerSense() {
            if (!this.player) return;
            this.state = 'SENSE_ACTIVE';
            this.animStartTime = performance.now();
            this.validMoves = []; // Re-use validMoves for highlighting

            const pLx = this.player.lx;
            const pLy = this.player.ly;

            // 1. Calculate Range (3 Tiles) & Reveal Hidden
            Object.values(this.chunks).forEach(tile => {
                if (tile.chunkId !== this.player.chunkId) return;
                const dist = Math.abs(tile.lx - pLx) + Math.abs(tile.ly - pLy);

                if (dist <= 3) {
                    // Add to highlight list
                    this.validMoves.push({
                        key: `${tile.gx},${tile.gy}`,
                        tile: tile,
                        dist: dist
                    });
                }
            });

            // 2. Update UI
            const txt = `Player is using sense at tile ${pLx},${pLy}.`;
            this.ui.popupText.textContent = txt;
            this.ui.popup.classList.add('visible');
        }
        parseMapData(dataStr) {
            const getV = (content, r) => (content.match(r) || [])[1] || '';

            // Parse Region Data
            const regionRegex = /<Region>([\s\S]*?)<\/Region>/g;
            let rMatch;
            while ((rMatch = regionRegex.exec(dataStr)) !== null) {
                const content = rMatch[1];
                const tileR = getV(content, /TileR\s*:\s*(\d+)[.,](\d+)\s*-\s*(\d+)[.,](\d+)/i);
                const exceptions = getV(content, /Exception\s*:\s*([\d.,\s|]+)/i);

                if (tileR) {
                    const parts = content.match(/TileR\s*:\s*(\d+)[.,](\d+)\s*-\s*(\d+)[.,](\d+)/i);
                    const region = {
                        name: getV(content, /Name\s*=\s*(.*)/i).trim(),
                        type: getV(content, /Type\s*=\s*(.*)/i).trim(),
                        x1: parseInt(parts[1]), y1: parseInt(parts[2]),
                        x2: parseInt(parts[3]), y2: parseInt(parts[4]),
                        exceptions: [],
                        color: '#4CAF50' // Default Forest Green
                    };

                    if (exceptions) {
                        exceptions.split('|').forEach(ex => {
                            const p = ex.trim().split(/[.,]/);
                            if (p.length === 2) region.exceptions.push(`${p[0]},${p[1]}`);
                        });
                    }
                    this.regions.push(region);
                }
            }

            // Parse Herb Data
            const herbRegex = /<Herb>([\s\S]*?)<\/Herb>/g;
            let hMatch;
            while ((hMatch = herbRegex.exec(dataStr)) !== null) {
                const content = hMatch[1];
                const tileMatch = content.match(/Tile\s*=\s*(\d+)[.,](\d+)/i);
                if (tileMatch) {
                    const k = `${tileMatch[1]},${tileMatch[2]}`;
                    this.herbData[k] = {
                        age: getV(content, /Age\s*=\s*(.*)/i).trim(),
                        rank: getV(content, /Rank\s*=\s*(.*)/i).trim(),
                        name: getV(content, /Name\s*=\s*(.*)/i).trim(),
                        element: getV(content, /Element\s*=\s*(.*)/i).trim(),
                        lore: getV(content, /Lore\s*=\s*(.*)/i).trim(),
                        growth: parseInt(getV(content, /Growth\s*=\s*(\d+)/i)) || 0
                    };
                }
            }

            // Parse Tree Data
            const treeRegex = /<Tree>([\s\S]*?)<\/Tree>/g;
            let tMatch;
            while ((tMatch = treeRegex.exec(dataStr)) !== null) {
                const content = tMatch[1];
                const tileMatch = content.match(/Tile\s*=\s*(\d+)[.,](\d+)/i);
                if (tileMatch) {
                    const k = `${tileMatch[1]},${tileMatch[2]}`;
                    this.treeData[k] = {
                        age: getV(content, /Age\s*=\s*(.*)/i).trim(),
                        element: getV(content, /Element\s*=\s*(.*)/i).trim(),
                        name: getV(content, /Name\s*=\s*(.*)/i).trim(),
                        lore: getV(content, /Lore\s*=\s*(.*)/i).trim(),
                    };
                }
            }

            const chunkMatch = dataStr.match(/Chunk\s*=\s*(\d+)/);
            if (!chunkMatch) return;
            const chunkId = parseInt(chunkMatch[1]);

            const newPosMatch = dataStr.match(/(?:Player|NewPosition)\s*=\s*(\d+)[.,](\d+)/i);
            const prevPosMatch = dataStr.match(/(?:LastPosition|PreviousPosition|PlayerPrev)\s*=\s*(\d+)[.,](\d+)/i);
            // Assets
            const lineRegex = /([MHT]|Hidden|Reveal)\s*:\s*([0-9.,|\s]+)/g;
            let match;
            while ((match = lineRegex.exec(dataStr)) !== null) {
                const type = match[1];
                const coordsRaw = match[2];
                const coordPairs = coordsRaw.split('|');

                // If it's a hidden/reveal tag, we don't need asset list, just coords
                const assets = (type !== 'Hidden' && type !== 'Reveal') ? CONFIG.ASSETS[type] : null;

                coordPairs.forEach(pair => {
                    pair = pair.trim();
                    if (!pair) return;
                    const splitChar = pair.includes(',') ? ',' : '.';
                    const parts = pair.split(splitChar);
                    if (parts.length >= 2) {
                        const lx = parseInt(parts[0].trim());
                        const ly = parseInt(parts[1].trim());

                        if (type === 'Hidden') {
                            const tile = this.getTile(chunkId, lx, ly);
                            if (tile) tile.assetHidden = true;
                        } else if (type === 'Reveal') {
                            const tile = this.getTile(chunkId, lx, ly);
                            if (tile) tile.assetHidden = false;
                        } else {
                            this.updateTileAsset(chunkId, lx, ly, assets, type);
                        }
                    }
                });
            }

            // Player Logic
            if (newPosMatch) {
                const newLx = parseInt(newPosMatch[1]);
                const newLy = parseInt(newPosMatch[2]);
                this.player.chunkId = chunkId;

                if (prevPosMatch) {
                    const prevLx = parseInt(prevPosMatch[1]);
                    const prevLy = parseInt(prevPosMatch[2]);

                    this.player.prevLx = prevLx;
                    this.player.prevLy = prevLy;
                    this.player.lx = newLx;
                    this.player.ly = newLy;

                    this.replayAnimation();
                } else {
                    this.player.lx = newLx;
                    this.player.ly = newLy;
                    this.player.visualLx = newLx;
                    this.player.visualLy = newLy;
                    this.player.isAnimating = false;
                }
                AssetManager.get(CONFIG.PLAYER_IMG);
                this.resetSelection();
            }
        }

        replayAnimation() {
            // Hide UI if open
            if (this.ui.herbPanel) this.ui.herbPanel.classList.remove('visible');

            // 1. Reset visual to previous
            this.player.visualLx = this.player.prevLx;
            this.player.visualLy = this.player.prevLy;

            // 2. Build Path
            const startTile = this.getTile(this.player.chunkId, this.player.prevLx, this.player.prevLy);
            const endTile = this.getTile(this.player.chunkId, this.player.lx, this.player.ly);

            if (startTile && endTile) {
                this.player.pathQueue = this.buildPathNodes(startTile, endTile);
                this.player.isAnimating = true;
                this.player.animState = 'INITIAL_DELAY';
                this.player.animTimer = performance.now();
            } else {
                this.player.visualLx = this.player.lx;
                this.player.visualLy = this.player.ly;
                this.player.isAnimating = false;
            }
        }

        getTile(chunkId, lx, ly) {
            return Object.values(this.chunks).find(t =>
                t.chunkId === chunkId && t.lx === lx && t.ly === ly
            );
        }

        buildPathNodes(startTile, endTile) {
            const nodes = [];
            // Simple Manhattan path generation
            let currX = startTile.lx;
            let currY = startTile.ly;

            // X direction
            while (currX !== endTile.lx) {
                currX += Math.sign(endTile.lx - currX);
                nodes.push({ lx: currX, ly: currY });
            }
            // Y direction
            while (currY !== endTile.ly) {
                currY += Math.sign(endTile.ly - currY);
                nodes.push({ lx: currX, ly: currY });
            }
            return nodes;
        }

        updateTileAsset(chunkId, lx, ly, assetList, type) {
            const tileKey = Object.keys(this.chunks).find(k => {
                const t = this.chunks[k];
                return t.chunkId === chunkId && t.lx === lx && t.ly === ly;
            });
            if (tileKey) {
                if (!this.chunks[tileKey].assetUrl) {
                    const randomImg = assetList[Math.floor(Math.random() * assetList.length)];
                    this.chunks[tileKey].assetUrl = randomImg;
                    this.chunks[tileKey].assetType = type;
                    AssetManager.get(randomImg);
                }
            }
        }

        resetSelection() {
            this.state = 'IDLE';
            this.validMoves = [];
            this.selectedPath = [];
        }

        calculateManhattanMoves() {
            if (!this.player) return;
            this.validMoves = [];
            const pLx = this.player.lx;
            const pLy = this.player.ly;

            Object.values(this.chunks).forEach(tile => {
                if (tile.chunkId !== this.player.chunkId) return;
                if (tile.lx === pLx && tile.ly === pLy) return;

                const dist = Math.abs(tile.lx - pLx) + Math.abs(tile.ly - pLy);

                if (dist <= 2) {
                    this.validMoves.push({
                        key: `${tile.gx},${tile.gy}`,
                        tile: tile,
                        dist: dist
                    });
                }
            });
        }

        buildPathTo(targetTile) {
            const pLx = this.player.lx;
            const pLy = this.player.ly;
            const path = [];

            const dist = Math.abs(targetTile.lx - pLx) + Math.abs(targetTile.ly - pLy);

            if (dist === 2) {
                let midLx = pLx + Math.sign(targetTile.lx - pLx);
                let midLy = pLy;
                if (targetTile.lx === pLx) {
                    midLy = pLy + Math.sign(targetTile.ly - pLy);
                }

                const midTile = Object.values(this.chunks).find(t =>
                    t.chunkId === this.player.chunkId && t.lx === midLx && t.ly === midLy
                );

                if (midTile) path.push({ tile: midTile, step: 1 });
                path.push({ tile: targetTile, step: 2 });
            } else {
                path.push({ tile: targetTile, step: 1 });
            }
            return path;
        }

        handleTileClick(tile, isRightClick) {
            if (!this.player) return;
            if (this.player.isAnimating) return;

            const isPlayerTile = (tile.lx === this.player.lx && tile.ly === this.player.ly);

            if (isRightClick) {
                if (this.state !== 'IDLE') {
                    this.resetSelection();
                    this.ui.popup.classList.remove('visible');
                }
                return;
            }

            if (isPlayerTile) {
                if (this.state === 'IDLE') {
                    this.calculateManhattanMoves();
                    this.state = 'SHOW_RANGE';
                    this.animStartTime = performance.now();
                } else {
                    this.resetSelection();
                    this.ui.popup.classList.remove('visible');
                }
            } else {
                if (this.state === 'SHOW_RANGE') {
                    const move = this.validMoves.find(m => m.key === `${tile.gx},${tile.gy}`);
                    if (move) {
                        this.selectedPath = this.buildPathTo(tile);
                        this.state = 'SHOW_PATH';
                        this.animStartTime = performance.now();
                        this.showMovementPopup(tile);
                    } else {
                        this.resetSelection();
                        this.ui.popup.classList.remove('visible');
                    }
                }
            }
        }

        showMovementPopup(targetTile) {
            const txt = `Player at ${this.player.lx},${this.player.ly} moving to ${targetTile.lx},${targetTile.ly}.`;
            this.ui.popupText.textContent = txt;
            this.ui.popup.classList.add('visible');
        }

        gridToScreen(gx, gy) {
            const halfW = CONFIG.TILE_WIDTH / 2;
            const halfH = CONFIG.TILE_HEIGHT / 2;
            const screenX = (gx - gy) * halfW;
            const screenY = (gx + gy) * halfH;
            return {
                x: (screenX * this.camera.zoom) + this.camera.x,
                y: (screenY * this.camera.zoom) + this.camera.y
            };
        }

        drawTile(tile, timestamp) {
            const pos = this.gridToScreen(tile.gx, tile.gy);
            const w = CONFIG.TILE_WIDTH * this.camera.zoom;
            const h = CONFIG.TILE_HEIGHT * this.camera.zoom;
            const d = CONFIG.TILE_THICKNESS * this.camera.zoom;
            const x = pos.x;
            const y = pos.y;
            const tileKey = `${tile.gx},${tile.gy}`;

            // 1. Geometry
            this.ctx.beginPath();
            this.ctx.moveTo(x - w / 2, y + h / 2);
            this.ctx.lineTo(x, y + h);
            this.ctx.lineTo(x, y + h + d);
            this.ctx.lineTo(x - w / 2, y + h / 2 + d);
            this.ctx.closePath();
            this.ctx.fillStyle = CONFIG.COLORS.SIDE_LEFT;
            this.ctx.fill();
            this.ctx.stroke();

            this.ctx.beginPath();
            this.ctx.moveTo(x + w / 2, y + h / 2);
            this.ctx.lineTo(x, y + h);
            this.ctx.lineTo(x, y + h + d);
            this.ctx.lineTo(x + w / 2, y + h / 2 + d);
            this.ctx.closePath();
            this.ctx.fillStyle = CONFIG.COLORS.SIDE_RIGHT;
            this.ctx.fill();
            this.ctx.stroke();

            this.ctx.beginPath();
            this.ctx.moveTo(x, y);
            this.ctx.lineTo(x + w / 2, y + h / 2);
            this.ctx.lineTo(x, y + h);
            this.ctx.lineTo(x - w / 2, y + h / 2);
            this.ctx.closePath();
            this.ctx.fillStyle = CONFIG.COLORS.TOP;
            this.ctx.fill();
            this.ctx.stroke();

            // 2. Highlights
            if (this.state === 'SHOW_RANGE' || this.state === 'SENSE_ACTIVE') {
                const move = this.validMoves.find(m => m.key === tileKey);
                if (move) {
                    const timeElapsed = timestamp - this.animStartTime;
                    const delay = (move.dist - 1) * CONFIG.ANIMATION.STAGGER_DELAY;

                    if (timeElapsed > delay) {
                        const alphaProgress = Math.min(1, (timeElapsed - delay) / CONFIG.ANIMATION.FADE_DURATION);
                        // Blue for Movement, Gold for Sense
                        const colorBase = (this.state === 'SENSE_ACTIVE') ? CONFIG.COLORS.HIGHLIGHT_GOLD : CONFIG.COLORS.HIGHLIGHT_BLUE;
                        this.ctx.fillStyle = colorBase.replace(/[\d.]+\)$/, `${0.6 * alphaProgress})`);
                        this.ctx.fill();
                    }
                }
            }

            if (this.state === 'SHOW_PATH') {
                const pathNode = this.selectedPath.find(n => n.tile === tile);
                if (pathNode) {
                    const timeElapsed = timestamp - this.animStartTime;
                    const delay = (pathNode.step - 1) * CONFIG.ANIMATION.STAGGER_DELAY;

                    if (timeElapsed > delay) {
                        const alphaProgress = Math.min(1, (timeElapsed - delay) / CONFIG.ANIMATION.FADE_DURATION);
                        this.ctx.fillStyle = CONFIG.COLORS.HIGHLIGHT_GOLD.replace(/[\d.]+\)$/, `${0.7 * alphaProgress})`);
                        this.ctx.fill();

                        if (pathNode.step === this.selectedPath.length && alphaProgress > 0.8) {
                            this.ctx.save();
                            this.ctx.translate(x, y + h / 2);
                            this.ctx.scale(1, 0.5);
                            this.ctx.beginPath();
                            this.ctx.arc(0, 0, w * 0.3, 0, Math.PI * 2);
                            this.ctx.lineWidth = 3;
                            this.ctx.strokeStyle = CONFIG.COLORS.SELECTION_CIRCLE;
                            this.ctx.stroke();
                            this.ctx.restore();
                        }
                    }
                }
            }

            // Hover
            if (this.ctx.isPointInPath(this.mousePos.x, this.mousePos.y)) {
                this.ctx.fillStyle = CONFIG.COLORS.HOVER;
                this.ctx.fill();
                this.hoveredTile = tile;
            }

            /// 3. Assets
            if (tile.assetUrl && !tile.assetHidden) {
                const img = AssetManager.get(tile.assetUrl);
                if (img && img.naturalWidth > 0) {
                    let scaleFactor = 0.8;
                    if (tile.assetType === 'H') scaleFactor = 0.65;
                    const scale = (w / img.naturalWidth) * scaleFactor;
                    const dw = img.naturalWidth * scale;
                    const dh = img.naturalHeight * scale;
                    const drawX = x - (dw / 2);
                    const groundOffset = tile.assetType === 'H' ? 0.25 : 0.5;
                    const drawY = (y + h / 2) - dh + (h * groundOffset);
                    this.ctx.drawImage(img, drawX, drawY, dw, dh);
                } else {
                    this.ctx.save();
                    this.ctx.translate(x, y + h / 2);
                    this.ctx.scale(1, 0.5);
                    this.ctx.beginPath();
                    this.ctx.arc(0, 0, w * 0.2, 0, Math.PI * 2);
                    this.ctx.fillStyle = (tile.assetType === 'H') ? CONFIG.COLORS.PLACEHOLDER_H : CONFIG.COLORS.PLACEHOLDER_M;
                    this.ctx.fill();
                    this.ctx.restore();
                }
            }
        }

        drawPlayer() {
            if (!this.player) return;

            const gx = this.player.visualLx - 1;
            const gy = this.player.visualLy - 1;
            const pos = this.gridToScreen(gx, gy);
            const w = CONFIG.TILE_WIDTH * this.camera.zoom;
            const x = pos.x;
            const y = pos.y;

            const pImg = AssetManager.get(CONFIG.PLAYER_IMG);
            const radius = w * 0.25;
            const thickness = 10 * this.camera.zoom;

            // Body
            this.ctx.save();
            this.ctx.translate(x, y + (CONFIG.TILE_HEIGHT * this.camera.zoom) / 2);
            this.ctx.scale(1, 0.5);
            this.ctx.beginPath(); this.ctx.arc(0, thickness, radius, 0, Math.PI * 2);
            this.ctx.fillStyle = '#222222';
            this.ctx.fill();
            this.ctx.restore();

            // Top
            this.ctx.save();
            this.ctx.translate(x, y + (CONFIG.TILE_HEIGHT * this.camera.zoom) / 2);
            this.ctx.scale(1, 0.5);
            this.ctx.beginPath();
            this.ctx.arc(0, 0, radius, 0, Math.PI * 2);
            this.ctx.clip();
            this.ctx.fillStyle = '#444444';
            this.ctx.fill();

            if (pImg && pImg.naturalWidth > 0) {
                this.ctx.drawImage(pImg, -radius, -radius, radius * 2, radius * 2);
            } else {
                this.ctx.fillStyle = '#ff0000';
                this.ctx.fill();
            }
            this.ctx.restore();

            // Ring
            this.ctx.save();
            this.ctx.translate(x, y + (CONFIG.TILE_HEIGHT * this.camera.zoom) / 2);
            this.ctx.scale(1, 0.5);
            this.ctx.beginPath();
            this.ctx.arc(0, 0, radius, 0, Math.PI * 2);
            this.ctx.lineWidth = 2;
            this.ctx.strokeStyle = '#ffffff';
            this.ctx.stroke();
            this.ctx.restore();
        }

        updateAnimation(timestamp) {
            if (!this.player.isAnimating) return;

            // 1. Initial Delay
            if (this.player.animState === 'INITIAL_DELAY') {
                if (timestamp - this.player.animTimer > CONFIG.ANIMATION.INITIAL_DELAY) {
                    this.player.animState = 'PREPARE_STEP';
                }
                return;
            }

            // 2. Prepare Next Tile
            if (this.player.animState === 'PREPARE_STEP') {
                if (this.player.pathQueue.length === 0) {
                    this.player.isAnimating = false;
                    this.player.animState = 'IDLE';
                    // Snap to exact
                    this.player.visualLx = this.player.lx;
                    this.player.visualLy = this.player.ly;

                    // Check for Asset Interaction (Herb or Tree)
                    // Check for Asset Interaction (Herb Only)
                    const tile = this.getTile(this.player.chunkId, this.player.lx, this.player.ly);
                    if (tile && tile.assetType === 'H') {
                        if (this.ui.herbPanel) {
                            const colors = { 'Fire': '#d32f2f', 'Earth': '#795548', 'Ice': '#81d4fa', 'Wind': '#9e9e9e', 'Water': '#1a237e' };

                            // HERB UI
                            const data = this.herbData[`${tile.lx},${tile.ly}`];
                            if (data) {
                                const color = colors[data.element] || '#000';
                                let phase = 'Early';
                                if (data.growth >= 100) phase = 'Peak';
                                else if (data.growth >= 75) phase = 'Ripe';
                                else if (data.growth >= 50) phase = 'Mature';
                                else if (data.growth >= 25) phase = 'Adult';

                                this.ui.herbPanel.innerHTML = `
                                    <div class="iso-herb-details">
                                        <div class="herb-title">
                                            ${data.age} ${data.rank} ${data.name}. 
                                            <span class="herb-elem" style="color:${color}">^${data.element}</span>
                                        </div>
                                        <div class="herb-lore">${data.lore}</div>
                                        <div class="growth-wrap">
                                            <div class="growth-txt">${phase}</div>
                                            <div class="growth-track">
                                                <div class="growth-stick" style="left: ${data.growth}%"></div>
                                            </div>
                                        </div>
                                        <div class="iso-actions">
                                            <button id="btn-harvest" class="iso-btn-action btn-harvest">Harvest</button>
                                            <button id="btn-feed" class="iso-btn-action btn-feed">Feed</button>
                                        </div>
                                    </div>
                                `;

                                let currentAction = null;
                                const btnH = document.getElementById('btn-harvest');
                                const btnF = document.getElementById('btn-feed');

                                const setHerbAction = (action, btn) => {
                                    if (currentAction === action) {
                                        currentAction = null;
                                        btnH.classList.remove('active', 'disabled');
                                        btnF.classList.remove('active', 'disabled');
                                        this.ui.popup.classList.remove('visible');
                                    } else {
                                        currentAction = action;
                                        btnH.classList.remove('active', 'disabled');
                                        btnF.classList.remove('active', 'disabled');

                                        btn.classList.add('active');
                                        if (btn === btnH) btnF.classList.add('disabled');
                                        else btnH.classList.add('disabled');

                                        const txt = `Herb at ${tile.lx},${tile.ly} named ${data.name} chosen to ${action}`;
                                        this.ui.popupText.textContent = txt;
                                        this.ui.popup.classList.add('visible');
                                    }
                                };
                                btnH.onclick = () => setHerbAction('Harvest', btnH);
                                btnF.onclick = () => setHerbAction('Feed', btnF);
                            }

                            this.ui.herbPanel.classList.add('visible');
                        }
                    }
                    return;
                }

                this.player.targetNode = this.player.pathQueue[0];
                this.player.startNode = { lx: this.player.visualLx, ly: this.player.visualLy };
                this.player.animTimer = timestamp;
                this.player.animState = 'MOVING';
            }

            // 3. Moving Phase (Interpolation)
            if (this.player.animState === 'MOVING') {
                const elapsed = timestamp - this.player.animTimer;
                const duration = CONFIG.ANIMATION.MOVE_DURATION;

                let progress = Math.min(elapsed / duration, 1.0);

                // Ease-in-out formula for smoother quality
                // p < 0.5 ? 2*p*p : -1+(4-2*p)*p
                const ease = progress < 0.5
                    ? 2 * progress * progress
                    : -1 + (4 - 2 * progress) * progress;

                const start = this.player.startNode;
                const end = this.player.targetNode;

                this.player.visualLx = start.lx + (end.lx - start.lx) * ease;
                this.player.visualLy = start.ly + (end.ly - start.ly) * ease;

                if (progress >= 1.0) {
                    // Arrived
                    this.player.visualLx = end.lx;
                    this.player.visualLy = end.ly;
                    this.player.pathQueue.shift();
                    this.player.animTimer = timestamp;
                    this.player.animState = 'PAUSED';
                }
            }

            // 4. Pause Phase (Stop per tile)
            if (this.player.animState === 'PAUSED') {
                if (timestamp - this.player.animTimer > CONFIG.ANIMATION.STEP_DELAY) {
                    this.player.animState = 'PREPARE_STEP';
                }
            }
        }

        drawRegions(timestamp) {
            // Ensure no rendering happens if disabled
            if (!this.showRegions || this.regions.length === 0) {
                this.ctx.globalAlpha = 1.0;
                return;
            }

            const elapsed = timestamp - this.regionAnimStart;
            const fillDuration = 800;
            const w = CONFIG.TILE_WIDTH * this.camera.zoom;
            const h = CONFIG.TILE_HEIGHT * this.camera.zoom;

            this.regions.forEach(reg => {
                // Precise corner mapping based on tile dimensions
                // Adjusted: Removed -1 offset to align with grid coordinates properly
                // Top Vertex: Top-Left Tile (x1, y1)
                const pTop = this.gridToScreen(reg.x1, reg.y1);

                // Right Vertex: Right corner of Top-Right Tile (x2, y1)
                const tRight = this.gridToScreen(reg.x2, reg.y1);
                const pRight = { x: tRight.x + w / 2, y: tRight.y + h / 2 };

                // Bottom Vertex: Bottom corner of Bottom-Right Tile (x2, y2)
                const tBottom = this.gridToScreen(reg.x2, reg.y2);
                const pBottom = { x: tBottom.x, y: tBottom.y + h };

                // Left Vertex: Left corner of Bottom-Left Tile (x1, y2)
                const tLeft = this.gridToScreen(reg.x1, reg.y2);
                const pLeft = { x: tLeft.x - w / 2, y: tLeft.y + h / 2 };

                const fillProgress = Math.min(elapsed / fillDuration, 1);
                const alpha = 0.5 * fillProgress;

                this.ctx.save();
                this.ctx.beginPath();
                this.ctx.moveTo(pTop.x, pTop.y);
                this.ctx.lineTo(pRight.x, pRight.y);
                this.ctx.lineTo(pBottom.x, pBottom.y);
                this.ctx.lineTo(pLeft.x, pLeft.y);
                this.ctx.closePath();

                // Draw the 'Covering' outline perfectly on the tile edges
                this.ctx.strokeStyle = `rgba(76, 175, 80, ${alpha})`;
                this.ctx.lineWidth = 3 * this.camera.zoom;
                this.ctx.lineJoin = "round";
                this.ctx.stroke();

                // Apply a very subtle ground overlay
                this.ctx.fillStyle = `rgba(76, 175, 80, ${alpha * 0.2})`;
                this.ctx.fill();
                this.ctx.restore();
            });
        }
        render(timestamp) {
            this.updateAnimation(timestamp);

            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            // Sort tiles for painters algorithm
            const sortedTiles = Object.values(this.chunks).sort((a, b) => {
                return (a.gx + a.gy) - (b.gx + b.gy);
            });

            // 1. Draw World
            sortedTiles.forEach(tile => this.drawTile(tile, timestamp));

            // 2. Draw Entities
            this.drawPlayer();

            // 3. Draw UI Overlays (Region borders on top of everything)
            this.drawRegions(timestamp);
        } loop(timestamp) {
            if (!this.active) return;
            this.render(timestamp);
            requestAnimationFrame((ts) => this.loop(ts));
        }

        onMouseDown(e) {
            this.lastMouse = { x: e.clientX, y: e.clientY };
            if (this.hoveredTile) {
                this.handleTileClick(this.hoveredTile, e.button === 2);
                if (e.button !== 2) this.isDragging = true;
            } else {
                if (e.button === 0) this.isDragging = true;
            }
        }

        onMouseUp() { this.isDragging = false; }

        onMouseMove(e) {
            this.mousePos.x = e.clientX;
            this.mousePos.y = e.clientY;
            if (this.isDragging) {
                const dx = e.clientX - this.lastMouse.x;
                const dy = e.clientY - this.lastMouse.y;
                this.camera.x += dx;
                this.camera.y += dy;
                this.lastMouse = { x: e.clientX, y: e.clientY };
            }
        }

        onWheel(e) {
            e.preventDefault();
            const scaleAmount = -e.deltaY * 0.001;
            this.camera.zoom = Math.min(Math.max(this.camera.zoom + scaleAmount, 0.5), 3.0);
        }
    }

    const engine = new IsoGameEngine();
    const checker = setInterval(() => {
        if (global.Game === "Start") {
            clearInterval(checker);
            engine.start();
        }
    }, 100);

    global.UpdateMap = function (dataString) {
        if (engine && engine.active) {
            engine.parseMapData(dataString);
        }
    };

})(window);