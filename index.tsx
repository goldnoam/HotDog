import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import * as THREE from 'three';
import { Trophy, Play, Pause, RotateCcw, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Info, Mail, Ghost, Keyboard, Music, Volume2, VolumeX, Settings, ArrowRightLeft, Zap, Gamepad2, Timer, MousePointer2 } from 'lucide-react';

// --- Game Constants & Types ---
const GRID_SIZE = 30; // Increased from 20 to 30
const TILE_SIZE = 1;
const LEVEL_DURATION = 25;
const COLORS = {
  background: 0x111111,
  grid: 0x222222,
  dogHead: 0x8B4513, // SaddleBrown
  dogBody: 0xCD853F, // Peru
  dogEar: 0x5D4037, // Darker Brown
  dogSnout: 0xECCFA1, // Lighter/Tan
  dogNose: 0x1A1A1A, // Almost Black
  hotdog: 0xFF4500, // OrangeRed
  hotdogEmissive: 0xFF2200, 
  friesBox: 0xDC143C, // Crimson
  friesStrip: 0xFFD700, // Gold
  mustard: 0xFFD700, // Gold
  ghostItem: 0x00FFFF, // Cyan
  ghostItemEmissive: 0x0088AA,
  burgerBun: 0xF4A460,
  burgerMeat: 0x8B0000,
  burgerLettuce: 0x32CD32,
  wall: 0x444444,
  trail: 0xA0522D, // Sienna
  boostTrail: 0xFF4500 // OrangeRed
};

// Cycle through these backgrounds as levels progress
const LEVEL_BACKGROUNDS = [
    0x111111, // Level 1: Default Black
    0x1a0f0f, // Level 2: Dark Red tint
    0x0f1a15, // Level 3: Dark Green tint
    0x0f101a, // Level 4: Dark Blue tint
    0x1a0f1a, // Level 5: Dark Purple tint
    0x1a1a0f  // Level 6: Dark Yellow tint
];

type Position = { x: number; z: number };
type GameState = 'START' | 'PLAYING' | 'PAUSED' | 'LEVEL_TRANSITION' | 'GAME_OVER';
type PowerUpType = 'MUSTARD' | 'GHOST' | 'BURGER';
type FoodType = 'HOTDOG' | 'FRIES';

interface PowerUp {
  x: number;
  z: number;
  type: PowerUpType;
}

interface FoodItem {
    x: number;
    z: number;
    type: FoodType;
    mesh: THREE.Object3D; // Changed from Mesh to Object3D to support Groups (Fries)
}

interface HighScore {
  name: string;
  score: number;
}

interface FloatingFood {
    mesh: THREE.Object3D;
    startPos: THREE.Vector3;
    progress: number;
}

interface GhostParticle {
    mesh: THREE.Mesh;
    velocity: THREE.Vector3;
    life: number;
}

interface TrailParticle {
    mesh: THREE.Mesh;
    velocity: THREE.Vector3;
    life: number;
    initialLife: number;
}

interface CrashParticle {
    mesh: THREE.Mesh;
    velocity: THREE.Vector3;
    rotationAxis: THREE.Vector3;
    life: number;
}

interface ConfettiParticle {
    mesh: THREE.Mesh;
    velocity: THREE.Vector3;
    rotationAxis: THREE.Vector3;
    life: number;
}

interface FireworkParticle {
    mesh: THREE.Mesh;
    velocity: THREE.Vector3;
    life: number;
    color: THREE.Color;
}

// --- Helper Functions ---
const getRandomPosition = (occupied: Position[]): Position => {
  let pos: Position;
  // Simple safety break after 100 tries to prevent infinite loop
  let tries = 0;
  do {
    pos = {
      x: Math.floor(Math.random() * GRID_SIZE) - GRID_SIZE / 2,
      z: Math.floor(Math.random() * GRID_SIZE) - GRID_SIZE / 2,
    };
    tries++;
  } while (occupied.some(p => p.x === pos.x && p.z === pos.z) && tries < 100);
  return pos;
};

// --- Main Component ---
const App = () => {
  // React State for UI
  const [gameState, setGameState] = useState<GameState>('START');
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [timeLeft, setTimeLeft] = useState(LEVEL_DURATION);
  const [highScores, setHighScores] = useState<HighScore[]>([]);
  const [playerName, setPlayerName] = useState('');
  const [isGhostMode, setIsGhostMode] = useState(false);
  const [isSpeedBoost, setIsSpeedBoost] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  // Refs for Game Engine Loop (To avoid stale closures)
  const gameStateRef = useRef<GameState>('START');
  const levelRef = useRef(1);
  const timeLeftRef = useRef(LEVEL_DURATION);

  // Refs for Game Engine Components
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const animationFrameRef = useRef<number>(0);
  const cameraShakeRef = useRef<number>(0);
  
  // Audio Refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const musicIntervalRef = useRef<any>(null);
  const musicNoteIndexRef = useRef(0);

  // Game Objects Refs
  const snakeRef = useRef<Position[]>([{ x: 0, z: 0 }]);
  const directionRef = useRef<Position>({ x: 0, z: -1 }); 
  
  // Input Buffer
  const moveQueueRef = useRef<Position[]>([]);

  // Replaces single foodRef with array of food items
  const foodsRef = useRef<FoodItem[]>([]);
  
  const powerUpRef = useRef<PowerUp | null>(null);
  
  const ghostModeEndTimeRef = useRef<number>(0);
  const speedBoostEndTimeRef = useRef<number>(0);
  const dogPulseEndTimeRef = useRef<number>(0); // New ref for pulse visual
  const lastMoveTimeRef = useRef(0);
  const moveIntervalRef = useRef(200); 
  const baseLevelSpeedRef = useRef(200);
  
  // Score Tracking
  const scoreRef = useRef(0);
  const levelStartScoreRef = useRef(0);
  
  // Particle System Refs
  const fireworksRef = useRef<FireworkParticle[]>([]); 
  const flyingFoodsRef = useRef<FloatingFood[]>([]);
  const flyingPowerUpsRef = useRef<FloatingFood[]>([]); // New ref for flying powerups
  const ghostParticlesRef = useRef<GhostParticle[]>([]);
  const trailParticlesRef = useRef<TrailParticle[]>([]);
  const crashParticlesRef = useRef<CrashParticle[]>([]);
  const confettiParticlesRef = useRef<ConfettiParticle[]>([]);
  
  // Three.js Meshes Refs
  const snakeMeshesRef = useRef<THREE.Object3D[]>([]);
  const powerUpMeshRef = useRef<THREE.Object3D | null>(null);

  // Sync State to Refs for the loop
  useEffect(() => { scoreRef.current = score; }, [score]);
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);
  useEffect(() => { levelRef.current = level; }, [level]);
  
  // UI Logic for Ghost/Boost indicators
  useEffect(() => {
    const interval = setInterval(() => {
        if (gameState === 'PLAYING') {
            const now = Date.now();
            setIsGhostMode(now < ghostModeEndTimeRef.current);
            setIsSpeedBoost(now < speedBoostEndTimeRef.current);
        } else {
            setIsGhostMode(false);
            setIsSpeedBoost(false);
        }
    }, 200);
    return () => clearInterval(interval);
  }, [gameState]);

  // --- Audio System ---
  const initAudio = () => {
    if (!audioCtxRef.current) {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContext) {
            audioCtxRef.current = new AudioContext();
        }
    }
    if (audioCtxRef.current?.state === 'suspended') {
        audioCtxRef.current.resume();
    }
  };

  const playSound = (type: 'EAT' | 'CRUNCH' | 'CRASH' | 'POWERUP' | 'LEVEL_UP' | 'CLICK' | 'BOOST' | 'PAUSE') => {
    if (isMuted || !audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    const now = ctx.currentTime;
    
    if (type === 'EAT') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(500, now);
        osc.frequency.exponentialRampToValueAtTime(800, now + 0.1);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
    } else if (type === 'CRUNCH') { // Sound for Fries
        osc.type = 'square';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.linearRampToValueAtTime(100, now + 0.1);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
    } else if (type === 'CRASH') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.4);
        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
        osc.start(now);
        osc.stop(now + 0.4);
    } else if (type === 'POWERUP') {
        // Distinct, bright sound
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.linearRampToValueAtTime(1200, now + 0.15);
        
        const osc2 = ctx.createOscillator();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(900, now);
        osc2.frequency.linearRampToValueAtTime(1800, now + 0.15);
        osc2.connect(gain);
        osc2.start(now);
        osc2.stop(now + 0.4);

        gain.gain.setValueAtTime(0.3, now); // Slightly louder
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
        osc.start(now);
        osc.stop(now + 0.4);
    } else if (type === 'LEVEL_UP') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.setValueAtTime(600, now + 0.1);
        osc.frequency.setValueAtTime(800, now + 0.2);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.linearRampToValueAtTime(0, now + 1);
        osc.start(now);
        osc.stop(now + 1);
    } else if (type === 'CLICK') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, now);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.start(now);
        osc.stop(now + 0.05);
    } else if (type === 'BOOST') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.linearRampToValueAtTime(600, now + 0.3);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
    } else if (type === 'PAUSE') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.linearRampToValueAtTime(200, now + 0.1);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
    }
  };

  const startMusic = () => {
      stopMusic();
      if (!audioCtxRef.current || isMuted) return;
      
      const ctx = audioCtxRef.current;
      const bassNotes = [55, 55, 65.41, 73.42]; // A1, A1, C2, D2
      
      const playNote = () => {
          if ((gameStateRef.current !== 'PLAYING' && gameStateRef.current !== 'LEVEL_TRANSITION') || isMuted || !audioCtxRef.current || audioCtxRef.current.state === 'suspended') return;
          
          const now = ctx.currentTime;
          const note = bassNotes[musicNoteIndexRef.current % bassNotes.length];
          
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(note, now);
          
          const filter = ctx.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(400, now);
          osc.disconnect();
          osc.connect(filter);
          filter.connect(gain);

          gain.gain.setValueAtTime(0.15, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
          
          osc.start(now);
          osc.stop(now + 0.2);
          
          musicNoteIndexRef.current++;

          const isBoost = Date.now() < speedBoostEndTimeRef.current;
          const tempo = isBoost ? 150 : 250; 

          musicIntervalRef.current = setTimeout(playNote, tempo);
      };

      playNote();
  };

  const stopMusic = () => {
      if (musicIntervalRef.current) {
          clearTimeout(musicIntervalRef.current);
          musicIntervalRef.current = null;
      }
  };

  useEffect(() => {
      if (isMuted) stopMusic();
      else if (gameState === 'PLAYING') startMusic();
  }, [isMuted, gameState]);

  // --- Initialization ---
  useEffect(() => {
    // Load High Scores
    const stored = localStorage.getItem('hotdog_highscores');
    if (stored) setHighScores(JSON.parse(stored));

    // Three.js Setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(COLORS.background);
    scene.fog = new THREE.Fog(COLORS.background, 15, 60);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 25, 25); // Adjusted camera for larger grid
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    if (mountRef.current) {
      mountRef.current.appendChild(renderer.domElement);
    }
    rendererRef.current = renderer;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(15, 30, 15);
    dirLight.castShadow = true;
    dirLight.shadow.camera.left = -GRID_SIZE;
    dirLight.shadow.camera.right = GRID_SIZE;
    dirLight.shadow.camera.top = GRID_SIZE;
    dirLight.shadow.camera.bottom = -GRID_SIZE;
    scene.add(dirLight);

    const gridHelper = new THREE.GridHelper(GRID_SIZE, GRID_SIZE, COLORS.grid, COLORS.grid);
    scene.add(gridHelper);

    // Walls
    const wallGeo = new THREE.BoxGeometry(GRID_SIZE, 1, 1);
    const wallMat = new THREE.MeshStandardMaterial({ color: COLORS.wall });
    
    const wallTop = new THREE.Mesh(wallGeo, wallMat);
    wallTop.position.set(0, 0.5, -GRID_SIZE / 2 - 0.5);
    scene.add(wallTop);

    const wallBottom = new THREE.Mesh(wallGeo, wallMat);
    wallBottom.position.set(0, 0.5, GRID_SIZE / 2 + 0.5);
    scene.add(wallBottom);

    const wallSideGeo = new THREE.BoxGeometry(1, 1, GRID_SIZE);
    const wallLeft = new THREE.Mesh(wallSideGeo, wallMat);
    wallLeft.position.set(-GRID_SIZE / 2 - 0.5, 0.5, 0);
    scene.add(wallLeft);

    const wallRight = new THREE.Mesh(wallSideGeo, wallMat);
    wallRight.position.set(GRID_SIZE / 2 + 0.5, 0.5, 0);
    scene.add(wallRight);

    // Initial Spawn happens in start/reset
    animate(0);

    const handleResize = () => {
      if (cameraRef.current && rendererRef.current) {
        cameraRef.current.aspect = window.innerWidth / window.innerHeight;
        cameraRef.current.updateProjectionMatrix();
        rendererRef.current.setSize(window.innerWidth, window.innerHeight);
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (mountRef.current && rendererRef.current) {
        mountRef.current.removeChild(rendererRef.current.domElement);
      }
      cancelAnimationFrame(animationFrameRef.current);
      stopMusic();
    };
  }, []);

  // --- Game Loop ---
  const animate = (time: number) => {
    animationFrameRef.current = requestAnimationFrame(animate);

    // Use Ref to check state because closure is stale
    if (gameStateRef.current === 'PLAYING') {
      const dt = time - lastMoveTimeRef.current;
      const isSpeedBoostActive = Date.now() < speedBoostEndTimeRef.current;
      const currentInterval = isSpeedBoostActive ? 60 : moveIntervalRef.current;

      if (dt > currentInterval) {
        updateGameLogic();
        lastMoveTimeRef.current = time;
      }

      // Animate Foods
      foodsRef.current.forEach((food, index) => {
          food.mesh.rotation.y += 0.02;
          // Add phase offset based on index so they don't bob in perfect unison
          food.mesh.position.y = 0.5 + Math.sin(time * 0.005 + index) * 0.2; 
      });

      if (powerUpMeshRef.current) {
          powerUpMeshRef.current.rotation.y += 0.02;
          powerUpMeshRef.current.position.y = 0.5 + Math.cos(time * 0.005) * 0.2;
      }

      updateFlyingFoods();
      updateFlyingPowerUps();
      updateTrailParticles();
      updateCrashParticles();
      updateConfettiParticles();
      updateDogVisuals(time);

      // Camera Shake
      if (cameraRef.current) {
         let shakeX = 0, shakeY = 0, shakeZ = 0;
         if (cameraShakeRef.current > 0) {
             const intensity = cameraShakeRef.current;
             shakeX = (Math.random() - 0.5) * intensity;
             shakeY = (Math.random() - 0.5) * intensity;
             shakeZ = (Math.random() - 0.5) * intensity;
             cameraShakeRef.current *= 0.9;
             if (cameraShakeRef.current < 0.1) cameraShakeRef.current = 0;
         }
         cameraRef.current.position.x = (Math.sin(time * 0.0005) * 2) + shakeX;
         cameraRef.current.position.y = 25 + shakeY; // Adjusted for new camera pos
         cameraRef.current.position.z = 25 + shakeZ;
         
         if (isSpeedBoostActive) {
             cameraRef.current.position.y -= 2;
             cameraRef.current.position.z -= 2;
         }
         cameraRef.current.lookAt(0, 0, 0);
      }
    } else if (gameStateRef.current === 'PAUSED') {
        // Just render static scene or idle animations, no logic updates
        if (cameraRef.current) {
            cameraRef.current.lookAt(0, 0, 0);
        }
    } else if (gameStateRef.current === 'LEVEL_TRANSITION') {
       updateFireworks();
       updateTrailParticles();
       updateCrashParticles();
       updateConfettiParticles();
       updateFlyingPowerUps(); // Finish any remaining flight
       if (cameraRef.current) {
           const angle = time * 0.0015;
           const radius = 30 + Math.sin(time * 0.001) * 5;
           const height = 20 + Math.cos(time * 0.001) * 5;
           cameraRef.current.position.x = Math.sin(angle) * radius;
           cameraRef.current.position.z = Math.cos(angle) * radius;
           cameraRef.current.position.y = height;
           cameraRef.current.lookAt(0, 0, 0);
       }
    } else if (gameStateRef.current === 'GAME_OVER' || gameStateRef.current === 'START') {
        updateCrashParticles();
        if (cameraRef.current) {
             const angle = time * 0.0005;
             cameraRef.current.position.x = Math.sin(angle) * 25;
             cameraRef.current.position.z = Math.cos(angle) * 25;
             cameraRef.current.lookAt(0, 0, 0);
        }
    }

    if (rendererRef.current && sceneRef.current && cameraRef.current) {
      rendererRef.current.render(sceneRef.current, cameraRef.current);
    }
  };

  const updateDogVisuals = (time: number) => {
    const now = Date.now();
    const ghostRemaining = ghostModeEndTimeRef.current - now;
    const isGhost = ghostRemaining > 0;
    const pulseRemaining = dogPulseEndTimeRef.current - now;
    const isPulsing = pulseRemaining > 0;
    
    // Spawn Ghost Particles
    if (isGhost && snakeMeshesRef.current.length > 0) {
        spawnGhostParticles();
    }

    // Update Ghost Particle positions
    for (let i = ghostParticlesRef.current.length - 1; i >= 0; i--) {
        const p = ghostParticlesRef.current[i];
        p.life -= 0.02;
        if (p.life <= 0) {
            sceneRef.current?.remove(p.mesh);
            ghostParticlesRef.current.splice(i, 1);
        } else {
            p.mesh.position.add(p.velocity);
            (p.mesh.material as THREE.MeshBasicMaterial).opacity = p.life * 0.6;
        }
    }

    // Update Dog Materials (Ghost & Pulse) & Tail Animation
    snakeMeshesRef.current.forEach((obj, index) => {
        let opacity = 1.0;
        let baseColor = index === 0 ? COLORS.dogHead : COLORS.dogBody;
        let isTransparent = false;
        let emissiveColor = 0x000000;
        let emissiveIntensity = 0;

        // Tail Wag Animation
        if (index === snakeMeshesRef.current.length - 1) {
             const tailMesh = obj.getObjectByName("tailMesh");
             if (tailMesh) {
                 // Simple sine wave wag
                 const wagSpeed = 0.015;
                 const wagAmount = 0.6;
                 tailMesh.rotation.y = Math.sin(time * wagSpeed) * wagAmount; 
             }
        }

        if (isGhost) {
            isTransparent = true;
            if (ghostRemaining < 2000) {
                opacity = Math.floor(now / 150) % 2 === 0 ? 0.3 : 0.6;
            } else {
                opacity = 0.5;
            }
            baseColor = COLORS.ghostItem;
        }
        
        if (isPulsing) {
            // Sine wave pulse for energy
            const pulse = 0.5 + Math.sin(now * 0.02) * 0.5;
            emissiveColor = 0xFFD700; // Gold pulse
            emissiveIntensity = pulse * 0.8;
        }

        obj.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                // Determine material type safely
                const mat = child.material;
                if (!mat) return;

                const material = mat as THREE.MeshStandardMaterial;

                // 1. Transparency handling
                material.transparent = isTransparent;
                material.opacity = opacity;
                
                // 2. Pulse / Emissive handling
                // Check if material supports emissive properties (StandardMaterial does, Basic does not)
                if (material.type === 'MeshStandardMaterial') {
                    if (isPulsing) {
                        material.emissive.setHex(emissiveColor);
                        material.emissiveIntensity = emissiveIntensity;
                    } else {
                        material.emissive.setHex(0x000000);
                        material.emissiveIntensity = 0;
                    }
                }

                // 3. Ghost Mode Color Override
                if (isGhost) {
                    material.color.setHex(baseColor);
                } else {
                    material.transparent = false;
                    material.opacity = 1.0;
                    // Restore Original Colors
                    if (child.name === 'nose') material.color.setHex(COLORS.dogNose);
                    else if (child.name === 'eye') material.color.setHex(0xffffff);
                    else if (child.name === 'pupil') material.color.setHex(0x000000);
                    else if (child.name === 'snout') material.color.setHex(COLORS.dogSnout);
                    else if (child.name === 'head') material.color.setHex(COLORS.dogHead);
                    else if (child.name === 'ear') material.color.setHex(COLORS.dogEar);
                    else if (child.name === 'body' || child.name === 'tailMesh') material.color.setHex(COLORS.dogBody);
                }
            }
        });
    });
  };

  const updateGameLogic = () => {
    // Timer Logic using Ref for accuracy in loop
    timeLeftRef.current -= 0.1;
    setTimeLeft(Math.max(0, Math.ceil(timeLeftRef.current)));

    if (timeLeftRef.current <= 0) {
        finishLevel();
        return;
    }

    // Movement Direction
    if (moveQueueRef.current.length > 0) {
        directionRef.current = moveQueueRef.current.shift()!;
    }

    const head = snakeRef.current[0];
    const newHead = { x: head.x + directionRef.current.x, z: head.z + directionRef.current.z };

    // Walls
    if (newHead.x < -GRID_SIZE / 2 || newHead.x >= GRID_SIZE / 2 || newHead.z < -GRID_SIZE / 2 || newHead.z >= GRID_SIZE / 2) {
        triggerCrash(head);
        return;
    }

    // Self Collision
    const isGhost = Date.now() < ghostModeEndTimeRef.current;
    if (!isGhost && snakeRef.current.some((p, i) => i !== snakeRef.current.length - 1 && p.x === newHead.x && p.z === newHead.z)) {
        triggerCrash(head);
        return;
    }

    // Move
    const newSnake = [newHead, ...snakeRef.current];
    let grown = false;

    // Eat Food (Collision with ANY food in the array)
    const foodIndex = foodsRef.current.findIndex(f => f.x === newHead.x && f.z === newHead.z);
    
    if (foodIndex !== -1) {
        const eatenFood = foodsRef.current[foodIndex];
        
        if (eatenFood.type === 'FRIES') {
            setScore(s => s + 150);
            playSound('CRUNCH');
            spawnConfetti(newHead, COLORS.friesStrip);
        } else {
            setScore(s => s + 100);
            playSound('EAT');
            spawnConfetti(newHead, COLORS.hotdog);
        }

        cameraShakeRef.current = 0.5;
        
        // Speed up
        moveIntervalRef.current = Math.max(50, moveIntervalRef.current - 2);

        // Visual Flying Food
        if (snakeMeshesRef.current[0]) {
            const flyingMesh = eatenFood.mesh.clone();
            sceneRef.current?.add(flyingMesh);
            flyingFoodsRef.current.push({
                mesh: flyingMesh,
                startPos: flyingMesh.position.clone(),
                progress: 0
            });
        }
        
        // Remove eaten food from scene and array
        sceneRef.current?.remove(eatenFood.mesh);
        foodsRef.current.splice(foodIndex, 1);

        // Spawn replacement
        spawnFood(1);
        spawnPowerUp();
        grown = true;
    } 
    
    // Eat PowerUp
    if (powerUpRef.current && newHead.x === powerUpRef.current.x && newHead.z === powerUpRef.current.z) {
        let burstColor = 0xffffff;
        if (powerUpRef.current.type === 'MUSTARD') burstColor = COLORS.mustard;
        else if (powerUpRef.current.type === 'GHOST') burstColor = COLORS.ghostItem;
        else if (powerUpRef.current.type === 'BURGER') burstColor = COLORS.burgerMeat;

        spawnConfetti(newHead, burstColor, 20); // Large burst
        
        handlePowerUp(powerUpRef.current.type);
        
        if (powerUpMeshRef.current) {
            // Visual Flying PowerUp
            if (snakeMeshesRef.current[0]) {
                const flyingMesh = powerUpMeshRef.current.clone();
                sceneRef.current?.add(flyingMesh);
                flyingPowerUpsRef.current.push({
                    mesh: flyingMesh,
                    startPos: flyingMesh.position.clone(),
                    progress: 0
                });
            }
            // Remove original immediately
            sceneRef.current?.remove(powerUpMeshRef.current);
            powerUpMeshRef.current = null;
        }
        
        powerUpRef.current = null;
    }

    if (!grown) {
        const tail = newSnake.pop();
        if (tail) spawnTrail(tail);
    }

    snakeRef.current = newSnake;
    updateSnakeMeshes();
  };

  const handlePowerUp = (type: PowerUpType) => {
      playSound('POWERUP');
      // Confetti burst is now handled in updateGameLogic at the specific location
      if (type === 'MUSTARD') {
          setScore(s => s + 500);
      } else if (type === 'GHOST') {
          ghostModeEndTimeRef.current = Date.now() + 10000;
          setScore(s => s + 200);
      } else if (type === 'BURGER') {
          setScore(s => s + 300);
          speedBoostEndTimeRef.current = Date.now() + 8000;
          dogPulseEndTimeRef.current = Date.now() + 2000; // Increased pulse duration to 2s
          playSound('BOOST');
          // Burger also forces immediate tempo change in music loop
      }
  };

  // Modified to spawn multiple foods
  const spawnFood = (count: number = 1) => {
      for(let i=0; i<count; i++) {
        const occupied = [...snakeRef.current, ...foodsRef.current];
        if (powerUpRef.current) occupied.push({x: powerUpRef.current.x, z: powerUpRef.current.z});
        
        const pos = getRandomPosition(occupied);
        
        // 25% Chance for Fries, else Hotdog
        const isFries = Math.random() < 0.25;
        let mesh: THREE.Object3D;
        const type: FoodType = isFries ? 'FRIES' : 'HOTDOG';

        if (isFries) {
            const group = new THREE.Group();
            // Red Box
            const boxGeo = new THREE.BoxGeometry(0.5, 0.4, 0.2);
            const boxMat = new THREE.MeshStandardMaterial({ color: COLORS.friesBox });
            const box = new THREE.Mesh(boxGeo, boxMat);
            box.position.y = 0.2;
            group.add(box);

            // Yellow Fries
            const fryMat = new THREE.MeshStandardMaterial({ color: COLORS.friesStrip });
            const fryGeo = new THREE.BoxGeometry(0.08, 0.4, 0.08);
            for(let j=0; j<5; j++) {
                const fry = new THREE.Mesh(fryGeo, fryMat);
                fry.position.set((Math.random()-0.5)*0.4, 0.4 + Math.random()*0.1, (Math.random()-0.5)*0.1);
                fry.rotation.z = (Math.random()-0.5)*0.5;
                group.add(fry);
            }
            mesh = group;
        } else {
            // Hotdog
            const geo = new THREE.CapsuleGeometry(0.25, 0.6, 4, 8);
            const mat = new THREE.MeshStandardMaterial({ 
                color: COLORS.hotdog,
                emissive: COLORS.hotdogEmissive,
                emissiveIntensity: 0.4
            });
            mesh = new THREE.Mesh(geo, mat);
            mesh.rotation.z = Math.PI / 2;
        }
        
        mesh.position.set(pos.x + 0.5, 0.5, pos.z + 0.5);
        sceneRef.current?.add(mesh);
        foodsRef.current.push({ x: pos.x, z: pos.z, mesh, type });
      }
  };

  const spawnPowerUp = () => {
      if (Math.random() > 0.3) return; // 30% chance
      
      // Occupied includes all food items now
      const occupied = [...snakeRef.current, ...foodsRef.current];
      const pos = getRandomPosition(occupied);
      const types: PowerUpType[] = ['MUSTARD', 'GHOST', 'BURGER'];
      const type = types[Math.floor(Math.random() * types.length)];
      
      powerUpRef.current = { x: pos.x, z: pos.z, type };
      
      if (powerUpMeshRef.current) sceneRef.current?.remove(powerUpMeshRef.current);

      let mesh: THREE.Object3D;
      
      if (type === 'MUSTARD') {
          const geo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
          const mat = new THREE.MeshStandardMaterial({ color: COLORS.mustard, emissive: 0x444400 });
          mesh = new THREE.Mesh(geo, mat);
      } else if (type === 'GHOST') {
          const geo = new THREE.SphereGeometry(0.3, 16, 16);
          const mat = new THREE.MeshStandardMaterial({ color: COLORS.ghostItem, emissive: COLORS.ghostItemEmissive, transparent: true, opacity: 0.8 });
          mesh = new THREE.Mesh(geo, mat);
      } else {
          // Burger
          const group = new THREE.Group();
          const bunMat = new THREE.MeshStandardMaterial({ color: COLORS.burgerBun });
          const meatMat = new THREE.MeshStandardMaterial({ color: COLORS.burgerMeat });
          const lettuceMat = new THREE.MeshStandardMaterial({ color: COLORS.burgerLettuce });

          const bottomBun = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.1, 8), bunMat);
          bottomBun.position.y = -0.15;
          const lettuce = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.05, 8), lettuceMat);
          lettuce.position.y = -0.05;
          const meat = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.1, 8), meatMat);
          meat.position.y = 0.05;
          const topBun = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8, 0, Math.PI * 2, 0, Math.PI/2), bunMat);
          topBun.position.y = 0.1;
          
          group.add(bottomBun, lettuce, meat, topBun);
          mesh = group;
      }

      mesh.position.set(pos.x + 0.5, 0.5, pos.z + 0.5);
      sceneRef.current?.add(mesh);
      powerUpMeshRef.current = mesh;
  };

  const updateSnakeMeshes = () => {
      // Remove old meshes
      snakeMeshesRef.current.forEach(m => sceneRef.current?.remove(m));
      snakeMeshesRef.current = [];

      snakeRef.current.forEach((pos, index) => {
          let mesh: THREE.Object3D;

          if (index === 0) {
              // --- HEAD ---
              const group = new THREE.Group();
              group.name = "headGroup";
              
              // 1. Cranium
              const headGeo = new THREE.BoxGeometry(0.85, 0.85, 0.9);
              const headMat = new THREE.MeshStandardMaterial({ color: COLORS.dogHead });
              const headMesh = new THREE.Mesh(headGeo, headMat);
              headMesh.name = "head";
              group.add(headMesh);

              // 2. Snout (Protruding forward, i.e., -Z local)
              const snoutGeo = new THREE.BoxGeometry(0.5, 0.4, 0.4);
              const snoutMat = new THREE.MeshStandardMaterial({ color: COLORS.dogSnout });
              const snout = new THREE.Mesh(snoutGeo, snoutMat);
              snout.position.set(0, -0.15, -0.55);
              snout.name = "snout";
              group.add(snout);

              // 3. Nose
              const noseGeo = new THREE.BoxGeometry(0.2, 0.15, 0.1);
              const noseMat = new THREE.MeshStandardMaterial({ color: COLORS.dogNose });
              const nose = new THREE.Mesh(noseGeo, noseMat);
              nose.position.set(0, -0.05, -0.75);
              nose.name = "nose";
              group.add(nose);

              // 4. Ears (Floppy)
              const earGeo = new THREE.BoxGeometry(0.15, 0.6, 0.4);
              const earMat = new THREE.MeshStandardMaterial({ color: COLORS.dogEar });
              
              const leftEar = new THREE.Mesh(earGeo, earMat);
              leftEar.position.set(-0.5, 0.1, -0.1);
              leftEar.rotation.z = 0.2; 
              leftEar.rotation.x = 0.1;
              leftEar.name = "ear";
              group.add(leftEar);

              const rightEar = new THREE.Mesh(earGeo, earMat);
              rightEar.position.set(0.5, 0.1, -0.1);
              rightEar.rotation.z = -0.2;
              rightEar.rotation.x = 0.1;
              rightEar.name = "ear";
              group.add(rightEar);

              // 5. Eyes
              const eyeWhiteGeo = new THREE.PlaneGeometry(0.25, 0.25);
              const eyeWhiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
              const pupilGeo = new THREE.PlaneGeometry(0.12, 0.12);
              const pupilMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
              
              const leftEye = new THREE.Mesh(eyeWhiteGeo, eyeWhiteMat);
              leftEye.position.set(-0.25, 0.15, -0.46);
              leftEye.rotation.y = Math.PI;
              leftEye.name = "eye";
              
              const rightEye = new THREE.Mesh(eyeWhiteGeo, eyeWhiteMat);
              rightEye.position.set(0.25, 0.15, -0.46);
              rightEye.rotation.y = Math.PI;
              rightEye.name = "eye";

              const leftPupil = new THREE.Mesh(pupilGeo, pupilMat);
              leftPupil.position.set(-0.25, 0.15, -0.47);
              leftPupil.rotation.y = Math.PI;
              leftPupil.name = "pupil";

              const rightPupil = new THREE.Mesh(pupilGeo, pupilMat);
              rightPupil.position.set(0.25, 0.15, -0.47);
              rightPupil.rotation.y = Math.PI;
              rightPupil.name = "pupil";

              group.add(leftEye, rightEye, leftPupil, rightPupil);

              mesh = group;
              
              if (directionRef.current.x === 1) mesh.rotation.y = -Math.PI / 2;
              else if (directionRef.current.x === -1) mesh.rotation.y = Math.PI / 2;
              else if (directionRef.current.z === 1) mesh.rotation.y = Math.PI;
              else mesh.rotation.y = 0;

          } else {
              // --- BODY & TAIL ---
              const group = new THREE.Group();
              group.name = "bodyGroup";

              // Use Capsule for smooth segments
              const geo = new THREE.CapsuleGeometry(0.4, 0.6, 4, 12);
              const mat = new THREE.MeshStandardMaterial({ color: COLORS.dogBody });
              const bodyMesh = new THREE.Mesh(geo, mat);
              bodyMesh.name = "body";
              
              const prev = snakeRef.current[index - 1];
              const curr = pos;
              
              const dx = prev.x - curr.x;
              const dz = prev.z - curr.z;
              
              // Align capsule with direction to previous segment
              if (dx === 1) bodyMesh.rotation.z = -Math.PI / 2;
              else if (dx === -1) bodyMesh.rotation.z = Math.PI / 2;
              else if (dz === 1) bodyMesh.rotation.x = Math.PI / 2;
              else if (dz === -1) bodyMesh.rotation.x = -Math.PI / 2;
              
              group.add(bodyMesh);

              // TAIL at the end of the snake
              if (index === snakeRef.current.length - 1) {
                  // Create a pivot group for the tail to handle animation independently
                  const tailPivot = new THREE.Group();
                  tailPivot.name = "tailPivot";

                  const tailGeo = new THREE.ConeGeometry(0.15, 0.5, 16);
                  const tailMat = new THREE.MeshStandardMaterial({ color: COLORS.dogBody });
                  const tailMesh = new THREE.Mesh(tailGeo, tailMat);
                  tailMesh.name = "tailMesh";
                  tailMesh.rotation.x = -Math.PI / 2; 
                  
                  tailPivot.add(tailMesh);
                  
                  // Position and orient the pivot based on direction to previous segment
                  if (dx === 1) { tailPivot.rotation.z = Math.PI / 2; tailPivot.position.x = -0.6; }
                  else if (dx === -1) { tailPivot.rotation.z = -Math.PI / 2; tailPivot.position.x = 0.6; }
                  else if (dz === 1) { tailPivot.rotation.x = -Math.PI / 2; tailPivot.position.z = -0.6; }
                  else if (dz === -1) { tailPivot.rotation.x = Math.PI / 2; tailPivot.position.z = 0.6; }

                  group.add(tailPivot);
              }
              
              mesh = group;
          }

          mesh.position.set(pos.x + 0.5, 0.5, pos.z + 0.5);
          sceneRef.current?.add(mesh);
          snakeMeshesRef.current.push(mesh);
      });
  };

  const triggerCrash = (pos: Position) => {
      playSound('CRASH');
      cameraShakeRef.current = 2.0;
      spawnCrashParticles(pos);
      setGameState('GAME_OVER');
      stopMusic();
  };

  const finishLevel = () => {
      playSound('LEVEL_UP');
      setGameState('LEVEL_TRANSITION');
      
      // Fireworks
      for (let i = 0; i < 5; i++) {
          setTimeout(() => spawnFirework(), i * 300);
      }

      setTimeout(() => {
          startLevel(levelRef.current + 1);
      }, 3000);
  };

  const spawnFirework = () => {
      if (!sceneRef.current) return;
      const x = (Math.random() - 0.5) * 10;
      const y = 5 + Math.random() * 5;
      const z = (Math.random() - 0.5) * 10;
      const color = new THREE.Color().setHSL(Math.random(), 1, 0.5);

      for (let i = 0; i < 40; i++) {
          const size = 0.2;
          const geo = new THREE.BoxGeometry(size, size, size);
          const mat = new THREE.MeshBasicMaterial({ color: color });
          const mesh = new THREE.Mesh(geo, mat);
          mesh.position.set(x, y, z);
          
          sceneRef.current.add(mesh);
          
          const velocity = new THREE.Vector3(
              (Math.random() - 0.5) * 0.5,
              (Math.random() - 0.5) * 0.5,
              (Math.random() - 0.5) * 0.5
          );

          fireworksRef.current.push({
              mesh, velocity, life: 1.5, color
          });
      }
  };

  const updateFireworks = () => {
      for (let i = fireworksRef.current.length - 1; i >= 0; i--) {
          const p = fireworksRef.current[i];
          p.life -= 0.02;
          if (p.life <= 0) {
              sceneRef.current?.remove(p.mesh);
              fireworksRef.current.splice(i, 1);
          } else {
              p.mesh.position.add(p.velocity);
              p.velocity.y -= 0.005; // Gravity
              p.mesh.rotation.x += 0.1;
          }
      }
  };

  // --- Particle Helpers ---
  const updateFlyingFoods = () => {
      const head = snakeMeshesRef.current[0];
      if (!head) return;
      for (let i = flyingFoodsRef.current.length - 1; i >= 0; i--) {
          const item = flyingFoodsRef.current[i];
          item.progress += 0.08; // Slower for better visibility
          if (item.progress >= 1) {
              sceneRef.current?.remove(item.mesh);
              flyingFoodsRef.current.splice(i, 1);
          } else {
              item.mesh.position.lerpVectors(item.startPos, head.position, item.progress);
              item.mesh.scale.setScalar(1 - item.progress * 0.8);
          }
      }
  };

  const updateFlyingPowerUps = () => {
      const head = snakeMeshesRef.current[0];
      if (!head) return;
      for (let i = flyingPowerUpsRef.current.length - 1; i >= 0; i--) {
          const item = flyingPowerUpsRef.current[i];
          item.progress += 0.04; // Slower for distinct animation
          if (item.progress >= 1) {
              sceneRef.current?.remove(item.mesh);
              flyingPowerUpsRef.current.splice(i, 1);
          } else {
              // Parabolic Arc to look distinct (Jumps up)
              const arcHeight = Math.sin(item.progress * Math.PI) * 2; 
              
              item.mesh.position.lerpVectors(item.startPos, head.position, item.progress);
              item.mesh.position.y += arcHeight; 

              // Pulse Effect during flight
              const pulse = 1 + Math.sin(item.progress * Math.PI * 6) * 0.5;
              item.mesh.scale.setScalar(pulse * (1 - item.progress));
              
              item.mesh.rotation.y += 0.5; // Fast spin
              item.mesh.rotation.x += 0.2;
          }
      }
  };

  const updateTrailParticles = () => {
      for (let i = trailParticlesRef.current.length - 1; i >= 0; i--) {
          const p = trailParticlesRef.current[i];
          p.life -= 0.015;
          if (p.life <= 0) {
              sceneRef.current?.remove(p.mesh);
              trailParticlesRef.current.splice(i, 1);
          } else {
              (p.mesh.material as THREE.MeshStandardMaterial).opacity = Math.max(0, p.life * 0.8);
              p.mesh.position.add(p.velocity);
              p.mesh.rotation.z += 0.02;
              const scale = 0.3 + (p.life / p.initialLife) * 0.7;
              p.mesh.scale.setScalar(scale);
          }
      }
  };

  const spawnTrail = (pos: Position) => {
    if (!sceneRef.current) return;
    const isBoost = Date.now() < speedBoostEndTimeRef.current;
    const particleCount = isBoost ? 6 : (3 + Math.floor(Math.random() * 3)); 
    for(let i=0; i<particleCount; i++) {
        const size = 0.2 + Math.random() * 0.3;
        const geo = new THREE.PlaneGeometry(size, size);
        const color = isBoost ? COLORS.boostTrail : COLORS.trail;
        const mat = new THREE.MeshStandardMaterial({ 
            color: color, 
            transparent: true, 
            opacity: 0.6 + Math.random() * 0.3,
            side: THREE.DoubleSide,
            emissive: isBoost ? 0xff0000 : 0x000000,
            emissiveIntensity: isBoost ? 0.5 : 0
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.rotation.z = Math.random() * Math.PI;
        const offsetX = (Math.random() - 0.5) * 0.8;
        const offsetZ = (Math.random() - 0.5) * 0.8;
        mesh.position.set(pos.x + 0.5 + offsetX, 0.02 + Math.random() * 0.05, pos.z + 0.5 + offsetZ);
        sceneRef.current.add(mesh);
        const life = 1.0 + Math.random() * 1.5; 
        trailParticlesRef.current.push({ 
            mesh, life, initialLife: life,
            velocity: new THREE.Vector3(0, 0.005 + Math.random() * (isBoost ? 0.02 : 0.005), 0)
        });
    }
  };

  const spawnConfetti = (pos: Position, color: number, count: number = 12) => {
    if (!sceneRef.current) return;
    for (let i = 0; i < count; i++) {
        const size = 0.1 + Math.random() * 0.15;
        const geo = new THREE.PlaneGeometry(size, size);
        const mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(pos.x + 0.5, 0.5, pos.z + 0.5);
        sceneRef.current.add(mesh);
        confettiParticlesRef.current.push({
            mesh,
            velocity: new THREE.Vector3((Math.random()-0.5)*0.4, Math.random()*0.4, (Math.random()-0.5)*0.4),
            rotationAxis: new THREE.Vector3(Math.random(), Math.random(), Math.random()),
            life: 1.0
        });
    }
  };
  
  const updateConfettiParticles = () => {
    for (let i = confettiParticlesRef.current.length - 1; i >= 0; i--) {
        const p = confettiParticlesRef.current[i];
        p.life -= 0.03;
        if (p.life <= 0) {
            sceneRef.current?.remove(p.mesh);
            confettiParticlesRef.current.splice(i, 1);
        } else {
            p.mesh.position.add(p.velocity);
            p.mesh.rotation.x += p.rotationAxis.x * 0.3;
            p.mesh.rotation.y += p.rotationAxis.y * 0.3;
            p.mesh.rotation.z += p.rotationAxis.z * 0.3;
            p.velocity.y -= 0.01;
            p.velocity.multiplyScalar(0.95);
            p.mesh.scale.setScalar(p.life);
        }
    }
  };

  const spawnCrashParticles = (pos: Position) => {
    if (!sceneRef.current) return;
    for (let i = 0; i < 20; i++) {
        const size = 0.1 + Math.random() * 0.2;
        const geo = new THREE.BoxGeometry(size, size, size);
        const mat = new THREE.MeshStandardMaterial({ color: Math.random()>0.5 ? COLORS.dogHead : COLORS.wall });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(pos.x + 0.5, 0.5, pos.z + 0.5);
        sceneRef.current.add(mesh);
        crashParticlesRef.current.push({
            mesh,
            velocity: new THREE.Vector3((Math.random()-0.5)*0.4, Math.random()*0.5, (Math.random()-0.5)*0.4),
            rotationAxis: new THREE.Vector3(Math.random(), Math.random(), Math.random()),
            life: 1.0 + Math.random()
        });
    }
  };

  const updateCrashParticles = () => {
      for (let i = crashParticlesRef.current.length - 1; i >= 0; i--) {
          const p = crashParticlesRef.current[i];
          p.life -= 0.02;
          if (p.life <= 0) {
              sceneRef.current?.remove(p.mesh);
              crashParticlesRef.current.splice(i, 1);
          } else {
              p.mesh.position.add(p.velocity);
              p.mesh.rotation.x += p.rotationAxis.x * 0.2;
              p.mesh.rotation.y += p.rotationAxis.y * 0.2;
              p.velocity.y -= 0.02;
              if (p.mesh.position.y < 0) {
                  p.mesh.position.y = 0;
                  p.velocity.y *= -0.5;
                  p.velocity.x *= 0.8;
                  p.velocity.z *= 0.8;
              }
              if (p.life < 0.3) p.mesh.scale.setScalar(p.life / 0.3 * p.mesh.scale.x);
          }
      }
  };

  const spawnGhostParticles = () => {
      const headMesh = snakeMeshesRef.current[0];
      if (!headMesh || !sceneRef.current) return;
      for(let i=0; i<2; i++) {
        const geo = new THREE.SphereGeometry(0.1, 4, 4);
        const mat = new THREE.MeshBasicMaterial({ color: COLORS.ghostItem, transparent: true, opacity: 0.6 });
        const mesh = new THREE.Mesh(geo, mat);
        const offset = new THREE.Vector3((Math.random()-0.5), (Math.random()-0.5), (Math.random()-0.5)).normalize().multiplyScalar(0.6);
        mesh.position.copy(headMesh.position).add(offset);
        sceneRef.current.add(mesh);
        ghostParticlesRef.current.push({
            mesh, velocity: new THREE.Vector3(0, 0.05 + Math.random()*0.05, 0), life: 1.0
        });
      }
  };

  // --- Game Control ---
  const startGame = () => {
      initAudio();
      playSound('CLICK');
      setGameState('PLAYING');
      resetGame(1);
  };

  const togglePause = () => {
      if (gameState === 'PLAYING') {
          playSound('PAUSE');
          setGameState('PAUSED');
      } else if (gameState === 'PAUSED') {
          playSound('CLICK');
          setGameState('PLAYING');
          // Reset lastMoveTime so we don't jump skip frames
          lastMoveTimeRef.current = performance.now();
      }
  };

  const startLevel = (lvl: number) => {
      setGameState('PLAYING');
      resetGame(lvl);
  };

  const retryLevel = () => {
      initAudio();
      playSound('CLICK');
      setGameState('PLAYING');
      
      // Restore score
      setScore(levelStartScoreRef.current);
      
      // Reset snake and Time
      snakeRef.current = [{ x: 0, z: 0 }];
      directionRef.current = { x: 0, z: -1 };
      moveQueueRef.current = [];
      updateSnakeMeshes();
      
      setTimeLeft(LEVEL_DURATION);
      timeLeftRef.current = LEVEL_DURATION;
      moveIntervalRef.current = baseLevelSpeedRef.current;
      
      // Clear foods
      foodsRef.current.forEach(f => sceneRef.current?.remove(f.mesh));
      foodsRef.current = [];
      
      spawnFood(levelRef.current * 5);
  };

  const resetGame = (lvl: number) => {
      setLevel(lvl);

      // Update Background for Level
      if (sceneRef.current) {
          const bgIndex = (lvl - 1) % LEVEL_BACKGROUNDS.length;
          const bgColor = new THREE.Color(LEVEL_BACKGROUNDS[bgIndex]);
          sceneRef.current.background = bgColor;
          if (sceneRef.current.fog) {
              sceneRef.current.fog.color = bgColor;
          }
      }

      if (lvl === 1) {
          setScore(0);
          levelStartScoreRef.current = 0;
      } else {
          levelStartScoreRef.current = scoreRef.current;
      }
      
      snakeRef.current = [{ x: 0, z: 0 }];
      directionRef.current = { x: 0, z: -1 };
      moveQueueRef.current = [];
      updateSnakeMeshes();
      
      setTimeLeft(LEVEL_DURATION);
      timeLeftRef.current = LEVEL_DURATION;
      
      // Increase speed with level
      baseLevelSpeedRef.current = Math.max(80, 200 - (lvl - 1) * 20);
      moveIntervalRef.current = baseLevelSpeedRef.current;
      
      ghostModeEndTimeRef.current = 0;
      speedBoostEndTimeRef.current = 0;
      dogPulseEndTimeRef.current = 0;
      
      // Clear existing foods
      foodsRef.current.forEach(f => sceneRef.current?.remove(f.mesh));
      foodsRef.current = [];

      // Scale food count with level
      spawnFood(lvl * 5);

      if (powerUpMeshRef.current) {
          sceneRef.current?.remove(powerUpMeshRef.current);
          powerUpMeshRef.current = null;
      }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
      // Shortcuts
      if (e.code === 'F1') {
          e.preventDefault();
          if (gameState === 'START' || gameState === 'GAME_OVER') {
              startGame();
          }
          return;
      }
      if (e.code === 'F2') {
          e.preventDefault();
          startGame();
          return;
      }
      if (e.code === 'F3') {
          e.preventDefault();
          togglePause();
          return;
      }
      if (e.code === 'F4') {
          e.preventDefault();
          setIsMuted(prev => !prev);
          return;
      }

      if (e.code === 'Space' || e.key === 'Enter') {
          if (gameState === 'START') startGame();
          else if (gameState === 'GAME_OVER') retryLevel(); 
      }
      
      if (e.code === 'Escape' || e.key === 'p' || e.key === 'P') {
          if (gameState === 'PLAYING' || gameState === 'PAUSED') {
              togglePause();
          }
      }
      
      if (gameState !== 'PLAYING') return;

      const queue = moveQueueRef.current;
      // Last queued move or current direction
      const lastMove = queue.length > 0 ? queue[queue.length - 1] : directionRef.current;
      
      const newDir = { ...lastMove };
      
      let intent: Position | null = null;
      
      // Support BOTH WASD and Arrows simultaneously
      if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') intent = { x: 0, z: -1 };
      else if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') intent = { x: 0, z: 1 };
      else if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') intent = { x: -1, z: 0 };
      else if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') intent = { x: 1, z: 0 };

      if (intent) {
          // Check collision with lastMove
          if (lastMove.x !== 0 && intent.x !== 0) return; // Ignore 180 on X
          if (lastMove.z !== 0 && intent.z !== 0) return; // Ignore 180 on Z
          
          moveQueueRef.current.push(intent);
      }
  };
  
  const handleTouch = (dir: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT') => {
      if (gameState !== 'PLAYING') return;
      const queue = moveQueueRef.current;
      const lastMove = queue.length > 0 ? queue[queue.length - 1] : directionRef.current;
      
      let intent: Position | null = null;
      if (dir === 'UP') intent = { x: 0, z: -1 };
      else if (dir === 'DOWN') intent = { x: 0, z: 1 };
      else if (dir === 'LEFT') intent = { x: -1, z: 0 };
      else if (dir === 'RIGHT') intent = { x: 1, z: 0 };

      if (intent) {
          if (lastMove.x !== 0 && intent.x !== 0) return; 
          if (lastMove.z !== 0 && intent.z !== 0) return; 
          moveQueueRef.current.push(intent);
      }
  };

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState]);

  // --- Render UI ---
  return (
    <div ref={mountRef} className="relative w-full h-full font-mono select-none overflow-hidden touch-none">
      
      {/* Top HUD */}
      {(gameState === 'PLAYING' || gameState === 'LEVEL_TRANSITION' || gameState === 'PAUSED') && (
        <div className="absolute top-0 left-0 w-full p-4 flex justify-between items-start text-white bg-gradient-to-b from-black/80 to-transparent z-10 pointer-events-none">
          <div className="flex flex-col gap-1">
             <div className="flex items-center gap-2 text-2xl font-bold text-yellow-400 drop-shadow-[0_0_10px_rgba(250,204,21,0.5)]">
               <Trophy size={24} /> {score}
             </div>
             <div className="text-sm text-gray-300">LEVEL {level}</div>
          </div>
          
          <div className="flex flex-col items-end gap-2 pointer-events-auto">
             <div className={`flex items-center gap-2 text-3xl font-bold ${timeLeft < 5 ? 'text-red-500 animate-pulse' : 'text-blue-400'}`}>
               <Timer size={28} /> {Math.ceil(timeLeft)}
             </div>
             <button onClick={togglePause} className="bg-white/10 hover:bg-white/20 p-2 rounded-full text-white backdrop-blur transition-colors">
                <Pause size={20} />
             </button>
          </div>
        </div>
      )}

      {/* Persistent Status Icons */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 flex gap-4 pointer-events-none">
          {isGhostMode && (
              <div className="flex items-center gap-1 bg-cyan-900/80 text-cyan-200 px-3 py-1 rounded-full border border-cyan-500 animate-pulse">
                  <Ghost size={16} /> <span className="text-xs font-bold">GHOST</span>
              </div>
          )}
          {isSpeedBoost && (
              <div className="flex items-center gap-1 bg-orange-900/80 text-orange-200 px-3 py-1 rounded-full border border-orange-500 animate-bounce">
                  <Zap size={16} /> <span className="text-xs font-bold">BOOST</span>
              </div>
          )}
      </div>

      {/* Start Dialog */}
      {gameState === 'START' && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-gray-900 border-2 border-yellow-500 rounded-xl p-8 max-w-md w-full shadow-[0_0_50px_rgba(234,179,8,0.3)] text-center relative overflow-hidden">
             
             {/* Header */}
             <div className="mb-6 relative">
                <h1 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-yellow-500 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]" style={{fontFamily: 'Impact, sans-serif'}}>
                   HOTDOG 3D
                </h1>
                <div className="text-gray-400 text-sm tracking-widest uppercase mt-2">Arcade Edition</div>
             </div>

             {/* Instructions Grid */}
             <div className="grid grid-cols-2 gap-4 mb-6 text-left">
                <div className="bg-gray-800/50 p-3 rounded-lg border border-gray-700">
                    <div className="flex items-center gap-2 text-yellow-400 mb-2 border-b border-gray-700 pb-1">
                        <Info size={16}/> <span className="text-xs font-bold">OBJECTIVE</span>
                    </div>
                    <p className="text-gray-300 text-xs leading-relaxed">
                        Eat hotdogs and fries to grow. Avoid walls and your own tail!
                    </p>
                </div>
                <div className="bg-gray-800/50 p-3 rounded-lg border border-gray-700">
                     <div className="flex items-center gap-2 text-blue-400 mb-2 border-b border-gray-700 pb-1">
                        <Zap size={16}/> <span className="text-xs font-bold">POWER-UPS</span>
                    </div>
                     <ul className="text-gray-300 text-xs space-y-1">
                         <li className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-600"></span> Fries +150pts</li>
                         <li className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500"></span> Mustard +500pts</li>
                         <li className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-cyan-400"></span> Ghost Mode</li>
                         <li className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500"></span> Burger Speed</li>
                     </ul>
                </div>
             </div>

             {/* Controls Info */}
             <div className="mb-8 flex flex-col items-center justify-center gap-2 bg-gray-800 p-3 rounded-lg">
                 <div className="flex items-center gap-2 px-4 py-1 rounded-full text-xs font-bold text-gray-300">
                    <Keyboard size={14}/> WASD / ARROWS to Move
                 </div>
                 <div className="flex items-center gap-4 text-[10px] text-gray-400">
                    <span>F1 Start</span>
                    <span>F2 Start Game</span>
                    <span>F3 Pause</span>
                    <span>F4 Mute</span>
                 </div>
             </div>

             {/* Play Button */}
             <button 
                onClick={startGame}
                className="group relative w-full bg-gradient-to-r from-yellow-600 to-red-600 text-white font-bold py-4 rounded-lg text-xl tracking-wider hover:scale-105 active:scale-95 transition-all shadow-[0_0_20px_rgba(220,38,38,0.5)] overflow-hidden"
             >
                <span className="relative z-10 flex items-center justify-center gap-2">
                    <Play fill="currentColor" /> START GAME
                </span>
                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
             </button>

             {/* High Scores Link/Display */}
             <div className="mt-4 text-xs text-gray-500">
                {highScores.length > 0 && (
                    <div className="mt-2 border-t border-gray-800 pt-2">
                       <div className="font-bold text-gray-400 mb-1">HIGH SCORE</div>
                       <div className="text-yellow-500 font-mono">{highScores[0].name} - {highScores[0].score}</div>
                    </div>
                )}
             </div>
          </div>
        </div>
      )}

      {/* Pause Menu */}
      {gameState === 'PAUSED' && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center z-50">
             <div className="bg-gray-900 border border-white/20 p-8 rounded-xl shadow-2xl flex flex-col gap-4 min-w-[250px] text-center">
                 <h2 className="text-3xl font-bold text-white mb-2">PAUSED</h2>
                 
                 <button 
                    onClick={togglePause}
                    className="w-full bg-yellow-600 hover:bg-yellow-500 text-white font-bold py-3 rounded flex items-center justify-center gap-2 transition-transform hover:scale-105"
                 >
                    <Play fill="currentColor" size={20} /> RESUME
                 </button>

                 <button 
                    onClick={() => {
                        setGameState('START');
                        stopMusic();
                    }}
                    className="w-full bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 rounded flex items-center justify-center gap-2 transition-transform hover:scale-105"
                 >
                    <RotateCcw size={20} /> QUIT TO MENU
                 </button>
             </div>
        </div>
      )}

      {/* Game Over Screen */}
      {gameState === 'GAME_OVER' && (
        <div className="absolute inset-0 bg-red-900/80 backdrop-blur-md flex flex-col items-center justify-center text-white z-50">
          <h2 className="text-6xl font-black italic mb-2 tracking-tighter drop-shadow-lg text-red-500 outline-text">GAME OVER</h2>
          <div className="text-2xl mb-8 font-mono">FINAL SCORE: <span className="text-yellow-400">{score}</span></div>
          
          <div className="bg-black/40 p-6 rounded-xl backdrop-blur-xl border border-white/10 flex flex-col gap-4 min-w-[300px]">
              
              {/* Name Entry */}
              <div className="flex flex-col gap-1">
                  <label className="text-xs text-gray-400 font-bold uppercase">Enter Name for Leaderboard</label>
                  <div className="flex gap-2">
                      <input 
                        type="text" 
                        maxLength={8}
                        placeholder="NAME"
                        className="bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white font-mono flex-1 focus:border-yellow-500 outline-none"
                        value={playerName}
                        onChange={(e) => setPlayerName(e.target.value.toUpperCase())}
                      />
                      <button 
                        onClick={() => {
                            const newScores = [...highScores, { name: playerName || 'ANON', score }].sort((a,b) => b.score - a.score).slice(0,5);
                            setHighScores(newScores);
                            localStorage.setItem('hotdog_highscores', JSON.stringify(newScores));
                            setPlayerName('SAVED!');
                        }}
                        disabled={playerName === 'SAVED!'}
                        className="bg-blue-600 hover:bg-blue-500 disabled:bg-green-600 px-4 rounded font-bold text-sm transition-colors"
                      >
                         {playerName === 'SAVED!' ? 'OK' : 'SAVE'}
                      </button>
                  </div>
              </div>

              <div className="h-px bg-white/10 my-2"></div>
              
              <button 
                onClick={retryLevel}
                className="w-full bg-yellow-600 hover:bg-yellow-500 text-white font-bold py-3 rounded flex items-center justify-center gap-2 transition-transform hover:scale-105"
              >
                <RotateCcw size={20} /> RETRY LEVEL
              </button>
              
              <button 
                onClick={() => startGame()}
                className="w-full bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 rounded flex items-center justify-center gap-2 transition-transform hover:scale-105"
              >
                <Play size={20} /> NEW GAME
              </button>
          </div>
        </div>
      )}

      {/* On-Screen Controls (Mobile/Tablet) */}
      {gameState === 'PLAYING' && (
        <>
            {/* Control Info Overlay (Bottom Left) */}
            <div className="absolute bottom-4 left-4 bg-black/40 backdrop-blur-md p-3 rounded-lg border border-white/10 text-white text-xs hidden sm:block pointer-events-none">
                <div className="flex items-center gap-2 mb-1">
                    <Gamepad2 size={16} className="text-yellow-500" />
                    <span className="font-bold opacity-80">CONTROLS</span>
                </div>
                <div className="grid grid-cols-3 gap-1 w-fit opacity-50">
                    <div></div>
                    <div className="w-6 h-6 border border-white/30 rounded flex items-center justify-center text-[10px]">W</div>
                    <div></div>
                    <div className="w-6 h-6 border border-white/30 rounded flex items-center justify-center text-[10px]">A</div>
                    <div className="w-6 h-6 border border-white/30 rounded flex items-center justify-center text-[10px]">S</div>
                    <div className="w-6 h-6 border border-white/30 rounded flex items-center justify-center text-[10px]">D</div>
                </div>
            </div>

            {/* Touch D-Pad (Visible on small screens or always active for touch) */}
            <div className="absolute bottom-8 right-8 grid grid-cols-3 gap-2 sm:hidden z-40">
                <div></div>
                <button onPointerDown={() => handleTouch('UP')} className="w-16 h-16 bg-white/10 hover:bg-white/30 backdrop-blur rounded-full flex items-center justify-center active:bg-yellow-500/50 transition-colors">
                    <ChevronUp size={32} color="white" />
                </button>
                <div></div>
                <button onPointerDown={() => handleTouch('LEFT')} className="w-16 h-16 bg-white/10 hover:bg-white/30 backdrop-blur rounded-full flex items-center justify-center active:bg-yellow-500/50 transition-colors">
                    <ChevronLeft size={32} color="white" />
                </button>
                <button onPointerDown={() => handleTouch('DOWN')} className="w-16 h-16 bg-white/10 hover:bg-white/30 backdrop-blur rounded-full flex items-center justify-center active:bg-yellow-500/50 transition-colors">
                    <ChevronDown size={32} color="white" />
                </button>
                <button onPointerDown={() => handleTouch('RIGHT')} className="w-16 h-16 bg-white/10 hover:bg-white/30 backdrop-blur rounded-full flex items-center justify-center active:bg-yellow-500/50 transition-colors">
                    <ChevronRight size={32} color="white" />
                </button>
            </div>
        </>
      )}

      {/* Mute Button */}
      <button 
        onClick={() => setIsMuted(!isMuted)}
        className="absolute bottom-4 right-4 sm:right-auto sm:left-48 bg-white/10 hover:bg-white/20 p-2 rounded-full text-white backdrop-blur z-50 transition-colors"
      >
        {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
      </button>

      {/* Footer */}
      <div className="absolute bottom-1 w-full text-center text-[10px] text-white/30 pointer-events-none">
        (C) Noam Gold AI 2025 | gold.noam@gmail.com
      </div>

    </div>
  );
};

// Mount the App
const rootElement = document.getElementById('root');
if (rootElement) {
  const root = createRoot(rootElement);
  root.render(<App />);
}

export default App;