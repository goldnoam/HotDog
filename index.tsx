import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import * as THREE from 'three';
import { Trophy, Play, Pause, RotateCcw, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Info, Mail, Ghost, Keyboard, Music, Volume2, VolumeX, Settings, ArrowRightLeft, Zap, Gamepad2, Timer, MousePointer2, Flame, Utensils } from 'lucide-react';

// --- Game Constants & Types ---
const GRID_SIZE = 30;
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
    mesh: THREE.Object3D;
}

interface HighScore {
  name: string;
  score: number;
}

interface FloatingFood {
    mesh: THREE.Object3D;
    startPos: THREE.Vector3;
    progress: number;
    type: 'FOOD' | 'POWERUP';
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
    color: THREE.Color;
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

  // Refs for Game Engine Loop
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
  const moveQueueRef = useRef<Position[]>([]);
  const foodsRef = useRef<FoodItem[]>([]);
  const powerUpRef = useRef<PowerUp | null>(null);
  
  const ghostModeEndTimeRef = useRef<number>(0);
  const speedBoostEndTimeRef = useRef<number>(0);
  const dogPulseEndTimeRef = useRef<number>(0);
  const lastMoveTimeRef = useRef(0);
  const moveIntervalRef = useRef(200); 
  const baseLevelSpeedRef = useRef(200);
  
  // Score Tracking
  const scoreRef = useRef(0);
  const levelStartScoreRef = useRef(0);
  
  // Particle System Refs
  const fireworksRef = useRef<FireworkParticle[]>([]); 
  const flyingFoodsRef = useRef<FloatingFood[]>([]);
  const flyingPowerUpsRef = useRef<FloatingFood[]>([]); 
  const ghostParticlesRef = useRef<GhostParticle[]>([]);
  const trailParticlesRef = useRef<TrailParticle[]>([]);
  const crashParticlesRef = useRef<CrashParticle[]>([]);
  const confettiParticlesRef = useRef<ConfettiParticle[]>([]);
  
  // Three.js Meshes Refs
  const snakeMeshesRef = useRef<THREE.Object3D[]>([]);
  const powerUpMeshRef = useRef<THREE.Object3D | null>(null);

  // Sync State to Refs
  useEffect(() => { scoreRef.current = score; }, [score]);
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);
  useEffect(() => { levelRef.current = level; }, [level]);
  
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
    } else if (type === 'CRUNCH') {
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
        gain.gain.setValueAtTime(0.3, now);
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
      const bassNotes = [55, 55, 65.41, 73.42];
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
    const stored = localStorage.getItem('hotdog_highscores');
    if (stored) setHighScores(JSON.parse(stored));

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(COLORS.background);
    scene.fog = new THREE.Fog(COLORS.background, 15, 60);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 25, 25);
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

    if (gameStateRef.current === 'PLAYING') {
      const dt = time - lastMoveTimeRef.current;
      const isSpeedBoostActive = Date.now() < speedBoostEndTimeRef.current;
      const currentInterval = isSpeedBoostActive ? 60 : moveIntervalRef.current;

      if (dt > currentInterval) {
        updateGameLogic();
        lastMoveTimeRef.current = time;
      }

      foodsRef.current.forEach((food, index) => {
          food.mesh.rotation.y += 0.02;
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
         cameraRef.current.position.y = 25 + shakeY;
         cameraRef.current.position.z = 25 + shakeZ;
         if (isSpeedBoostActive) {
             cameraRef.current.position.y -= 2;
             cameraRef.current.position.z -= 2;
         }
         cameraRef.current.lookAt(0, 0, 0);
      }
    } else if (gameStateRef.current === 'PAUSED') {
        if (cameraRef.current) cameraRef.current.lookAt(0, 0, 0);
    } else if (gameStateRef.current === 'LEVEL_TRANSITION') {
       updateFireworks();
       updateTrailParticles();
       updateCrashParticles();
       updateConfettiParticles();
       updateFlyingPowerUps();
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

    snakeMeshesRef.current.forEach((obj, index) => {
        let opacity = 1.0;
        let baseColor = index === 0 ? COLORS.dogHead : COLORS.dogBody;
        let isTransparent = false;
        let emissiveColor = 0x000000;
        let emissiveIntensity = 0;

        if (index === snakeMeshesRef.current.length - 1) {
             const tailMesh = obj.getObjectByName("tailMesh");
             if (tailMesh) {
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
            const pulse = 0.5 + Math.sin(now * 0.02) * 0.5;
            emissiveColor = 0xFFD700; 
            emissiveIntensity = pulse * 0.8;
        }

        obj.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                const mat = child.material;
                if (!mat) return;
                const material = mat as THREE.MeshStandardMaterial;

                material.transparent = isTransparent;
                material.opacity = opacity;
                
                if (material.type === 'MeshStandardMaterial') {
                    if (isPulsing) {
                        material.emissive.setHex(emissiveColor);
                        material.emissiveIntensity = emissiveIntensity;
                    } else {
                        material.emissive.setHex(0x000000);
                        material.emissiveIntensity = 0;
                    }
                }

                if (isGhost) {
                    material.color.setHex(baseColor);
                } else {
                    material.transparent = false;
                    material.opacity = 1.0;
                    if (child.name === 'headMain') material.color.setHex(COLORS.dogHead);
                    else if (child.name === 'headSnout') material.color.setHex(COLORS.dogSnout);
                    else if (child.name === 'headEar') material.color.setHex(COLORS.dogEar);
                    else if (child.name === 'headNose') material.color.setHex(COLORS.dogNose);
                    else if (child.name === 'eyeWhite') material.color.setHex(0xFFFFFF);
                    else if (child.name === 'eyePupil') material.color.setHex(0x000000);
                    else if (child.name === 'tailMesh') material.color.setHex(COLORS.dogBody);
                    else material.color.setHex(COLORS.dogBody);
                }
            }
        });
    });
};

  const updateGameLogic = () => {
    // 1. Determine Direction
    if (moveQueueRef.current.length > 0) {
      directionRef.current = moveQueueRef.current.shift()!;
    }
    const currentHead = snakeRef.current[0];
    const nextHead = {
      x: currentHead.x + directionRef.current.x,
      z: currentHead.z + directionRef.current.z,
    };

    // 2. Collision Detection
    const hitWall = nextHead.x > GRID_SIZE / 2 || nextHead.x < -GRID_SIZE / 2 || nextHead.z > GRID_SIZE / 2 || nextHead.z < -GRID_SIZE / 2;
    const hitSelf = snakeRef.current.some((segment, index) => index !== 0 && segment.x === nextHead.x && segment.z === nextHead.z);

    if (hitWall || (hitSelf && Date.now() > ghostModeEndTimeRef.current)) {
       triggerCrash(nextHead);
       setGameState('GAME_OVER');
       setPlayerName('');
       return;
    }

    // 3. Move Snake
    const newSnake = [nextHead, ...snakeRef.current];
    
    // 4. Food Collision
    const foodIndex = foodsRef.current.findIndex(f => f.x === nextHead.x && f.z === nextHead.z);
    
    if (foodIndex !== -1) {
      const eatenFood = foodsRef.current[foodIndex];
      const points = eatenFood.type === 'FRIES' ? 150 : 100;
      setScore(s => s + points);
      playSound(eatenFood.type === 'FRIES' ? 'CRUNCH' : 'EAT');
      
      // Speed up slightly per food (dynamic difficulty)
      moveIntervalRef.current = Math.max(50, moveIntervalRef.current - 2);

      // Effects
      triggerFloatingFood(eatenFood.mesh.clone(), nextHead, 'FOOD');
      spawnConfetti(nextHead, eatenFood.type === 'FRIES' ? new THREE.Color(COLORS.friesStrip) : new THREE.Color(COLORS.hotdog), 8);
      
      // Remove eaten food from scene and array
      sceneRef.current?.remove(eatenFood.mesh);
      foodsRef.current.splice(foodIndex, 1);

      // Spawn new food to maintain count
      spawnFood(); 

      cameraShakeRef.current = 0.5;
    } else {
      // Trail effect from tail
      const tail = newSnake.pop()!;
      spawnTrailParticle(tail);
    }

    snakeRef.current = newSnake;

    // 5. Power-Up Collision
    if (powerUpRef.current && nextHead.x === powerUpRef.current.x && nextHead.z === powerUpRef.current.z) {
      setScore(s => s + 500);
      playSound('POWERUP');
      if (powerUpMeshRef.current) {
          triggerFloatingFood(powerUpMeshRef.current.clone(), nextHead, 'POWERUP');
          sceneRef.current?.remove(powerUpMeshRef.current);
      }
      
      let confettiColor = new THREE.Color(COLORS.mustard);

      if (powerUpRef.current.type === 'MUSTARD') {
          // Just points
      } else if (powerUpRef.current.type === 'GHOST') {
          ghostModeEndTimeRef.current = Date.now() + 10000;
          confettiColor = new THREE.Color(COLORS.ghostItem);
      } else if (powerUpRef.current.type === 'BURGER') {
          speedBoostEndTimeRef.current = Date.now() + 8000;
          dogPulseEndTimeRef.current = Date.now() + 1000; 
          playSound('BOOST');
          confettiColor = new THREE.Color(COLORS.burgerBun);
      }
      
      spawnConfetti(nextHead, confettiColor, 20); 
      powerUpRef.current = null;
      powerUpMeshRef.current = null;
    }

    // 6. Update Timer & Level
    timeLeftRef.current -= moveIntervalRef.current / 1000; 
    setTimeLeft(Math.ceil(timeLeftRef.current));

    if (timeLeftRef.current <= 0) {
      nextLevel();
    }

    updateThreeObjects();
  };

  const nextLevel = () => {
      playSound('LEVEL_UP');
      setGameState('LEVEL_TRANSITION');
      // Trigger Fireworks
      for (let i = 0; i < 15; i++) {
        setTimeout(() => spawnFirework(), i * 300);
      }

      setTimeout(() => {
          setLevel(l => {
             levelRef.current = l + 1;
             return l + 1;
          });
          
          // Difficulty Scaling
          baseLevelSpeedRef.current = Math.max(50, baseLevelSpeedRef.current - 15);
          moveIntervalRef.current = baseLevelSpeedRef.current;
          
          // Reset Timer
          setTimeLeft(LEVEL_DURATION);
          timeLeftRef.current = LEVEL_DURATION;

          // Level Score Save
          levelStartScoreRef.current = scoreRef.current;
          
          resetGame(false);
          setGameState('PLAYING');
      }, 4000);
  };
  
  const retryLevel = () => {
      // Restore score to start of level
      setScore(levelStartScoreRef.current);
      scoreRef.current = levelStartScoreRef.current;
      
      // Reset timer
      setTimeLeft(LEVEL_DURATION);
      timeLeftRef.current = LEVEL_DURATION;
      
      // Reset speed to level base
      moveIntervalRef.current = baseLevelSpeedRef.current;
      
      // Reset positions
      resetGame(false); 
      setGameState('PLAYING');
  };

  const triggerCrash = (pos: Position) => {
      playSound('CRASH');
      cameraShakeRef.current = 2.0;
      for (let i = 0; i < 20; i++) {
          spawnCrashParticle(pos);
      }
  };

  const spawnTrailParticle = (pos: Position) => {
      const isSpeedBoost = Date.now() < speedBoostEndTimeRef.current;
      const count = 3;
      for(let i=0; i<count; i++) {
        const geo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
        const mat = new THREE.MeshBasicMaterial({ 
            color: isSpeedBoost ? COLORS.boostTrail : COLORS.trail, 
            transparent: true, 
            opacity: 0.5 
        });
        const mesh = new THREE.Mesh(geo, mat);
        
        const offsetX = (Math.random() - 0.5) * 0.8;
        const offsetZ = (Math.random() - 0.5) * 0.8;
        
        mesh.position.set(pos.x + offsetX, 0.1, pos.z + offsetZ);
        mesh.rotation.x = Math.random() * Math.PI;
        mesh.rotation.y = Math.random() * Math.PI;
        
        sceneRef.current?.add(mesh);
        
        trailParticlesRef.current.push({
            mesh,
            velocity: new THREE.Vector3(0, 0.02 + Math.random() * 0.03, 0),
            life: 1.0,
            initialLife: 1.0
        });
      }
  };

  const spawnGhostParticles = () => {
    if (snakeMeshesRef.current.length === 0) return;
    const head = snakeMeshesRef.current[0];
    const geo = new THREE.SphereGeometry(0.1, 4, 4);
    const mat = new THREE.MeshBasicMaterial({ color: COLORS.ghostItem, transparent: true });
    const mesh = new THREE.Mesh(geo, mat);
    
    mesh.position.copy(head.position);
    mesh.position.y += 0.5;
    mesh.position.x += (Math.random() - 0.5) * 0.5;
    mesh.position.z += (Math.random() - 0.5) * 0.5;
    
    sceneRef.current?.add(mesh);
    ghostParticlesRef.current.push({
        mesh,
        velocity: new THREE.Vector3(0, 0.05, 0),
        life: 1.0
    });
  };

  const updateTrailParticles = () => {
      for (let i = trailParticlesRef.current.length - 1; i >= 0; i--) {
          const p = trailParticlesRef.current[i];
          p.life -= 0.02; // Fade out slowly
          if (p.life <= 0) {
              sceneRef.current?.remove(p.mesh);
              trailParticlesRef.current.splice(i, 1);
          } else {
              p.mesh.position.add(p.velocity);
              p.mesh.rotation.x += 0.05;
              (p.mesh.material as THREE.MeshBasicMaterial).opacity = (p.life / p.initialLife) * 0.5;
          }
      }
  };

  const spawnCrashParticle = (pos: Position) => {
      const geo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
      const color = Math.random() > 0.5 ? COLORS.dogBody : COLORS.wall;
      const mat = new THREE.MeshStandardMaterial({ color });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(pos.x, 0.5, pos.z);
      sceneRef.current?.add(mesh);
      
      crashParticlesRef.current.push({
          mesh,
          velocity: new THREE.Vector3(
              (Math.random() - 0.5) * 0.5,
              Math.random() * 0.5,
              (Math.random() - 0.5) * 0.5
          ),
          rotationAxis: new THREE.Vector3(Math.random(), Math.random(), Math.random()),
          life: 1.0
      });
  };

  const updateCrashParticles = () => {
      for (let i = crashParticlesRef.current.length - 1; i >= 0; i--) {
          const p = crashParticlesRef.current[i];
          p.life -= 0.02;
          p.velocity.y -= 0.02; // Gravity
          if (p.life <= 0 || p.mesh.position.y < -5) {
              sceneRef.current?.remove(p.mesh);
              crashParticlesRef.current.splice(i, 1);
          } else {
              p.mesh.position.add(p.velocity);
              p.mesh.rotateOnAxis(p.rotationAxis, 0.1);
              p.mesh.scale.setScalar(p.life);
          }
      }
  };

  const spawnConfetti = (pos: Position, color: THREE.Color, count: number = 8) => {
      for(let i=0; i<count; i++) {
        const geo = new THREE.PlaneGeometry(0.2, 0.2);
        const mat = new THREE.MeshBasicMaterial({ color: color, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(pos.x, 0.5, pos.z);
        sceneRef.current?.add(mesh);
        confettiParticlesRef.current.push({
            mesh,
            velocity: new THREE.Vector3((Math.random()-0.5)*0.3, Math.random()*0.4, (Math.random()-0.5)*0.3),
            rotationAxis: new THREE.Vector3(Math.random(), Math.random(), Math.random()),
            life: 1.0,
            color
        });
      }
  };

  const updateConfettiParticles = () => {
      for (let i = confettiParticlesRef.current.length - 1; i >= 0; i--) {
          const p = confettiParticlesRef.current[i];
          p.life -= 0.02;
          p.velocity.y -= 0.01;
          if (p.life <= 0) {
              sceneRef.current?.remove(p.mesh);
              confettiParticlesRef.current.splice(i, 1);
          } else {
              p.mesh.position.add(p.velocity);
              p.mesh.rotateOnAxis(p.rotationAxis, 0.2);
          }
      }
  };

  const spawnFirework = () => {
      const x = (Math.random() - 0.5) * GRID_SIZE;
      const z = (Math.random() - 0.5) * GRID_SIZE;
      const y = 10 + Math.random() * 10;
      const color = new THREE.Color().setHSL(Math.random(), 1, 0.5);
      
      for (let i = 0; i < 30; i++) {
          const geo = new THREE.SphereGeometry(0.2, 4, 4);
          const mat = new THREE.MeshBasicMaterial({ color });
          const mesh = new THREE.Mesh(geo, mat);
          mesh.position.set(x, y, z);
          sceneRef.current?.add(mesh);
          
          const velocity = new THREE.Vector3(
              (Math.random() - 0.5) * 0.5,
              (Math.random() - 0.5) * 0.5,
              (Math.random() - 0.5) * 0.5
          );
          
          fireworksRef.current.push({ mesh, velocity, life: 1.0, color });
      }
  };

  const updateFireworks = () => {
      for (let i = fireworksRef.current.length - 1; i >= 0; i--) {
          const p = fireworksRef.current[i];
          p.life -= 0.015;
          p.velocity.y -= 0.005; // Gravity
          if (p.life <= 0) {
              sceneRef.current?.remove(p.mesh);
              fireworksRef.current.splice(i, 1);
          } else {
              p.mesh.position.add(p.velocity);
              (p.mesh.material as THREE.MeshBasicMaterial).opacity = p.life;
          }
      }
  };
  
  const triggerFloatingFood = (mesh: THREE.Object3D, startPos: Position, type: 'FOOD' | 'POWERUP') => {
      mesh.position.set(startPos.x, 0.5, startPos.z);
      sceneRef.current?.add(mesh);
      const list = type === 'FOOD' ? flyingFoodsRef.current : flyingPowerUpsRef.current;
      list.push({
          mesh,
          startPos: new THREE.Vector3(startPos.x, 0.5, startPos.z),
          progress: 0,
          type
      });
  };
  
  const updateFlyingFoods = () => {
      if (!sceneRef.current || snakeMeshesRef.current.length === 0) return;
      const headPos = snakeMeshesRef.current[0].position;
      
      for (let i = flyingFoodsRef.current.length - 1; i >= 0; i--) {
          const item = flyingFoodsRef.current[i];
          item.progress += 0.10; // Slowed down from 0.15 for better visibility
          
          if (item.progress >= 1) {
              sceneRef.current.remove(item.mesh);
              flyingFoodsRef.current.splice(i, 1);
          } else {
              item.mesh.position.lerpVectors(item.startPos, headPos, item.progress);
              item.mesh.scale.setScalar(1 - item.progress * 0.5);
              item.mesh.rotation.y += 0.2;
          }
      }
  };

  const updateFlyingPowerUps = () => {
      if (!sceneRef.current || snakeMeshesRef.current.length === 0) return;
      const headPos = snakeMeshesRef.current[0].position;
      
      for (let i = flyingPowerUpsRef.current.length - 1; i >= 0; i--) {
          const item = flyingPowerUpsRef.current[i];
          item.progress += 0.05; // Slower for effect
          
          if (item.progress >= 1) {
              sceneRef.current.remove(item.mesh);
              flyingPowerUpsRef.current.splice(i, 1);
          } else {
              // Parabolic arc interpolation
              item.mesh.position.lerpVectors(item.startPos, headPos, item.progress);
              // Add Arc height
              item.mesh.position.y += Math.sin(item.progress * Math.PI) * 3;
              
              // Pulsing Scale
              const scale = 1 + Math.sin(item.progress * Math.PI * 4) * 0.5;
              item.mesh.scale.setScalar(scale);
              
              item.mesh.rotation.y += 0.5;
              item.mesh.rotation.x += 0.2;
          }
      }
  };

  const updateThreeObjects = () => {
    // 1. Remove old snake meshes
    snakeMeshesRef.current.forEach(mesh => sceneRef.current?.remove(mesh));
    snakeMeshesRef.current = [];

    // 2. Create new snake meshes
    snakeRef.current.forEach((segment, index) => {
      let mesh;
      if (index === 0) {
          // Detailed Head Group
          const group = new THREE.Group();
          
          // Skull
          const headGeo = new THREE.BoxGeometry(0.8, 0.8, 1.0);
          const headMat = new THREE.MeshStandardMaterial({ color: COLORS.dogHead });
          const headMain = new THREE.Mesh(headGeo, headMat);
          headMain.name = 'headMain';
          group.add(headMain);

          // Snout
          const snoutGeo = new THREE.BoxGeometry(0.6, 0.5, 0.4);
          const snoutMat = new THREE.MeshStandardMaterial({ color: COLORS.dogSnout });
          const snout = new THREE.Mesh(snoutGeo, snoutMat);
          snout.position.set(0, -0.1, -0.6);
          snout.name = 'headSnout';
          group.add(snout);

          // Nose
          const noseGeo = new THREE.BoxGeometry(0.2, 0.2, 0.1);
          const noseMat = new THREE.MeshStandardMaterial({ color: COLORS.dogNose });
          const nose = new THREE.Mesh(noseGeo, noseMat);
          nose.position.set(0, 0, -0.8);
          nose.name = 'headNose';
          group.add(nose);
          
          // Ears
          const earGeo = new THREE.BoxGeometry(0.2, 0.6, 0.4);
          const earMat = new THREE.MeshStandardMaterial({ color: COLORS.dogEar });
          const leftEar = new THREE.Mesh(earGeo, earMat);
          leftEar.position.set(-0.5, 0.2, -0.2);
          leftEar.rotation.z = -0.3;
          leftEar.name = 'headEar';
          group.add(leftEar);
          
          const rightEar = new THREE.Mesh(earGeo, earMat);
          rightEar.position.set(0.5, 0.2, -0.2);
          rightEar.rotation.z = 0.3;
          rightEar.name = 'headEar';
          group.add(rightEar);

          // Eyes
          const eyeGeo = new THREE.PlaneGeometry(0.2, 0.2);
          const eyeMat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF }); // Basic material for eyes to avoid lighting issues
          const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
          leftEye.position.set(-0.25, 0.2, -0.51);
          leftEye.name = 'eyeWhite';
          group.add(leftEye);

          const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
          rightEye.position.set(0.25, 0.2, -0.51);
          rightEye.name = 'eyeWhite';
          group.add(rightEye);
          
          const pupilGeo = new THREE.PlaneGeometry(0.1, 0.1);
          const pupilMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
          const leftPupil = new THREE.Mesh(pupilGeo, pupilMat);
          leftPupil.position.set(-0.25, 0.2, -0.52);
          leftPupil.name = 'eyePupil';
          group.add(leftPupil);
          
          const rightPupil = new THREE.Mesh(pupilGeo, pupilMat);
          rightPupil.position.set(0.25, 0.2, -0.52);
          rightPupil.name = 'eyePupil';
          group.add(rightPupil);

          // Rotate head based on direction
          group.position.set(segment.x, 0.5, segment.z);
          if (directionRef.current.x === 1) group.rotation.y = -Math.PI / 2;
          else if (directionRef.current.x === -1) group.rotation.y = Math.PI / 2;
          else if (directionRef.current.z === 1) group.rotation.y = Math.PI;
          else if (directionRef.current.z === -1) group.rotation.y = 0;

          mesh = group;

      } else {
        // Body Segment
        const geo = new THREE.SphereGeometry(0.45, 16, 16);
        const mat = new THREE.MeshStandardMaterial({ color: COLORS.dogBody });
        mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(segment.x, 0.5, segment.z);

        // Tail logic for last segment
        if (index === snakeRef.current.length - 1) {
            const bodyGroup = new THREE.Group();
            bodyGroup.position.set(segment.x, 0.5, segment.z);
            
            // Re-center sphere in group
            const bodyMesh = new THREE.Mesh(geo, mat);
            bodyGroup.add(bodyMesh);

            // Calculate direction from previous segment to orient tail
            const prev = snakeRef.current[index - 1];
            const dx = prev.x - segment.x;
            const dz = prev.z - segment.z;
            
            const tailPivot = new THREE.Group();
            if (dx === 1) tailPivot.rotation.y = Math.PI / 2;
            else if (dx === -1) tailPivot.rotation.y = -Math.PI / 2;
            else if (dz === 1) tailPivot.rotation.y = 0;
            else if (dz === -1) tailPivot.rotation.y = Math.PI;
            
            const tailGeo = new THREE.ConeGeometry(0.15, 0.6, 8);
            const tailMat = new THREE.MeshStandardMaterial({ color: COLORS.dogBody });
            const tailMesh = new THREE.Mesh(tailGeo, tailMat);
            tailMesh.rotation.x = -Math.PI / 2 + 0.5; // Slight up angle
            tailMesh.position.z = -0.4;
            tailMesh.name = "tailMesh"; // Tag for animation
            
            tailPivot.add(tailMesh);
            bodyGroup.add(tailPivot);
            
            mesh = bodyGroup;
        }
      }
      sceneRef.current?.add(mesh);
      snakeMeshesRef.current.push(mesh);
    });
  };

  const spawnFood = () => {
    // Ensure we have (Level * 5) foods
    const desiredCount = levelRef.current * 5;
    
    while (foodsRef.current.length < desiredCount) {
        const occupied = [
            ...snakeRef.current, 
            ...foodsRef.current, 
            ...(powerUpRef.current ? [powerUpRef.current] : [])
        ];
        const pos = getRandomPosition(occupied);
        
        // 25% chance for Fries, else Hotdog
        const isFries = Math.random() < 0.25;
        let mesh: THREE.Object3D;
        const type: FoodType = isFries ? 'FRIES' : 'HOTDOG';

        if (isFries) {
            const group = new THREE.Group();
            // Box
            const boxGeo = new THREE.BoxGeometry(0.5, 0.4, 0.3);
            const boxMat = new THREE.MeshStandardMaterial({ color: COLORS.friesBox });
            const box = new THREE.Mesh(boxGeo, boxMat);
            box.position.y = 0.2;
            group.add(box);
            
            // Fries strips
            const fryGeo = new THREE.BoxGeometry(0.1, 0.4, 0.1);
            const fryMat = new THREE.MeshStandardMaterial({ color: COLORS.friesStrip });
            for(let i=0; i<3; i++) {
                const fry = new THREE.Mesh(fryGeo, fryMat);
                fry.position.set((Math.random()-0.5)*0.3, 0.5, (Math.random()-0.5)*0.1);
                fry.rotation.z = (Math.random()-0.5)*0.5;
                group.add(fry);
            }
            mesh = group;
        } else {
            // Hotdog
            const geo = new THREE.CapsuleGeometry(0.2, 0.6, 4, 8);
            const mat = new THREE.MeshStandardMaterial({ 
                color: COLORS.hotdog, 
                emissive: COLORS.hotdogEmissive,
                emissiveIntensity: 0.4
            });
            mesh = new THREE.Mesh(geo, mat);
            mesh.rotation.z = Math.PI / 2;
        }

        mesh.position.set(pos.x, 0.5, pos.z);
        sceneRef.current?.add(mesh);
        foodsRef.current.push({ ...pos, mesh, type });
    }
    
    // Chance to spawn powerup if none exists
    if (!powerUpRef.current && Math.random() < 0.3) { // 30% chance per spawn cycle
        spawnPowerUp();
    }
  };
  
  const spawnPowerUp = () => {
      if (powerUpMeshRef.current) sceneRef.current?.remove(powerUpMeshRef.current);
      
      const occupied = [...snakeRef.current, ...foodsRef.current];
      const pos = getRandomPosition(occupied);
      const rand = Math.random();
      const type: PowerUpType = rand < 0.4 ? 'MUSTARD' : rand < 0.7 ? 'GHOST' : 'BURGER';
      
      let mesh: THREE.Object3D;
      
      if (type === 'MUSTARD') {
          const geo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
          const mat = new THREE.MeshStandardMaterial({ color: COLORS.mustard, emissive: COLORS.mustard, emissiveIntensity: 0.5 });
          mesh = new THREE.Mesh(geo, mat);
      } else if (type === 'GHOST') {
          const geo = new THREE.SphereGeometry(0.3, 8, 8);
          const mat = new THREE.MeshStandardMaterial({ color: COLORS.ghostItem, transparent: true, opacity: 0.8, emissive: COLORS.ghostItemEmissive, emissiveIntensity: 0.8 });
          mesh = new THREE.Mesh(geo, mat);
      } else { // BURGER
          const group = new THREE.Group();
          const bunMat = new THREE.MeshStandardMaterial({ color: COLORS.burgerBun });
          const meatMat = new THREE.MeshStandardMaterial({ color: COLORS.burgerMeat });
          const lettuceMat = new THREE.MeshStandardMaterial({ color: COLORS.burgerLettuce });
          
          const botBun = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.1, 8), bunMat);
          botBun.position.y = 0;
          
          const meat = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.1, 8), meatMat);
          meat.position.y = 0.1;

          const lettuce = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.05, 8), lettuceMat);
          lettuce.position.y = 0.18;

          const topBun = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8, 0, Math.PI * 2, 0, Math.PI/2), bunMat);
          topBun.position.y = 0.2;
          
          group.add(botBun, meat, lettuce, topBun);
          mesh = group;
      }
      
      mesh.position.set(pos.x, 0.5, pos.z);
      sceneRef.current?.add(mesh);
      powerUpMeshRef.current = mesh;
      powerUpRef.current = { ...pos, type };
  };

  const resetGame = (fullReset = true) => {
    setGameState('PLAYING');
    initAudio();
    if (fullReset) {
        setScore(0);
        setLevel(1);
        setTimeLeft(LEVEL_DURATION);
        setIsGhostMode(false);
        setIsSpeedBoost(false);
        moveIntervalRef.current = 200;
        baseLevelSpeedRef.current = 200;
        scoreRef.current = 0;
        levelRef.current = 1;
        timeLeftRef.current = LEVEL_DURATION;
        levelStartScoreRef.current = 0;
        ghostModeEndTimeRef.current = 0;
        speedBoostEndTimeRef.current = 0;
    }
    
    // Clear Queues
    directionRef.current = { x: 0, z: -1 };
    moveQueueRef.current = [];
    
    // Reset Snake
    snakeRef.current = [
      { x: 0, z: 2 },
      { x: 0, z: 3 },
      { x: 0, z: 4 },
    ];
    
    // Clear existing objects
    snakeMeshesRef.current.forEach(m => sceneRef.current?.remove(m));
    foodsRef.current.forEach(f => sceneRef.current?.remove(f.mesh));
    if (powerUpMeshRef.current) sceneRef.current?.remove(powerUpMeshRef.current);
    
    foodsRef.current = [];
    powerUpRef.current = null;
    powerUpMeshRef.current = null;
    snakeMeshesRef.current = [];

    // Reset Background Color based on level
    if (sceneRef.current) {
        const bgHex = LEVEL_BACKGROUNDS[(levelRef.current - 1) % LEVEL_BACKGROUNDS.length];
        const color = new THREE.Color(bgHex);
        sceneRef.current.background = color;
        sceneRef.current.fog = new THREE.Fog(bgHex, 15, 60);
    }
    
    spawnFood();
  };

  const startGame = () => {
      playSound('CLICK');
      resetGame(true);
  };
  
  const togglePause = () => {
      if (gameStateRef.current === 'PLAYING') {
          setGameState('PAUSED');
          playSound('PAUSE');
          stopMusic();
      } else if (gameStateRef.current === 'PAUSED') {
          setGameState('PLAYING');
          playSound('PAUSE');
          startMusic();
      }
  };

  const saveScore = () => {
      const newScore = { name: playerName || 'ANONYMOUS', score };
      const newHighScores = [...highScores, newScore].sort((a, b) => b.score - a.score).slice(0, 5);
      setHighScores(newHighScores);
      localStorage.setItem('hotdog_highscores', JSON.stringify(newHighScores));
      setGameState('START');
  };

  // --- Input Handling ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Global Shortcuts
      if (e.key === 'F2') {
          startGame();
          return;
      }
      if (e.key === 'F3') {
          togglePause();
          return;
      }
      if (e.key === 'F4') {
          setIsMuted(prev => !prev);
          return;
      }
      if (e.key === 'Escape') {
          togglePause();
          return;
      }
      
      if (gameStateRef.current === 'START' || gameStateRef.current === 'GAME_OVER') {
          if (e.code === 'Space' || e.key === 'Enter' || e.key === 'F1') {
              startGame();
          }
          return;
      }

      if (gameStateRef.current !== 'PLAYING') return;

      const key = e.key.toLowerCase();
      let nextDir: Position | null = null;

      if (key === 'arrowup' || key === 'w') nextDir = { x: 0, z: -1 };
      else if (key === 'arrowdown' || key === 's') nextDir = { x: 0, z: 1 };
      else if (key === 'arrowleft' || key === 'a') nextDir = { x: -1, z: 0 };
      else if (key === 'arrowright' || key === 'd') nextDir = { x: 1, z: 0 };

      if (nextDir) {
        // Use last queued move or current direction to validate
        const lastMove = moveQueueRef.current.length > 0 ? moveQueueRef.current[moveQueueRef.current.length - 1] : directionRef.current;
        
        // Prevent 180 turns
        if (nextDir.x !== -lastMove.x || nextDir.z !== -lastMove.z) {
            // Simple buffer limiter
            if (moveQueueRef.current.length < 3) {
                moveQueueRef.current.push(nextDir);
            }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // --- UI Components ---
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', fontFamily: 'Segoe UI, sans-serif', color: 'white', userSelect: 'none' }}>
      
      {/* 3D Container */}
      <div ref={mountRef} style={{ width: '100%', height: '100%' }} />

      {/* HUD */}
      {gameState === 'PLAYING' || gameState === 'LEVEL_TRANSITION' || gameState === 'PAUSED' ? (
        <div style={{ position: 'absolute', top: 20, left: 20, right: 20, display: 'flex', justifyContent: 'space-between', fontSize: '1.2rem', textShadow: '0 2px 4px rgba(0,0,0,0.8)', pointerEvents: 'none' }}>
           <div style={{ display: 'flex', gap: '20px' }}>
             <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Trophy color="#FFD700" /> {score}</div>
             <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Timer color={timeLeft < 6 ? "red" : "white"} /> {timeLeft}s</div>
           </div>
           <div style={{ display: 'flex', gap: '20px' }}>
             <div>LEVEL {level}</div>
             {isGhostMode && <div style={{ color: '#00FFFF', display: 'flex', alignItems: 'center', gap: '5px' }}><Ghost size={20}/> GHOST</div>}
             {isSpeedBoost && <div style={{ color: '#FF4500', display: 'flex', alignItems: 'center', gap: '5px' }}><Zap size={20}/> BOOST</div>}
           </div>
        </div>
      ) : null}

      {/* Pause Menu */}
      {gameState === 'PAUSED' && (
          <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}>
              <h1 style={{ fontSize: '3rem', margin: '0 0 20px 0', textShadow: '0 0 10px white' }}>PAUSED</h1>
              <button onClick={togglePause} style={btnStyle}><Play size={20} /> RESUME (F3)</button>
              <button onClick={() => setGameState('START')} style={{...btnStyle, backgroundColor: '#444'}}>QUIT TO MENU</button>
          </div>
      )}

      {/* Start Dialog */}
      {gameState === 'START' && (
        <div style={{
          position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
          backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 50
        }}>
          <div style={{
            background: 'linear-gradient(135deg, #1e1e2f 0%, #101015 100%)',
            padding: '50px', borderRadius: '25px', border: '2px solid #00FFFF',
            boxShadow: '0 0 40px rgba(0, 255, 255, 0.25)', maxWidth: '700px', width: '90%', textAlign: 'center'
          }}>
            <h1 style={{ fontSize: '4rem', margin: '0 0 10px 0', fontFamily: 'Impact, sans-serif', letterSpacing: '3px', background: 'linear-gradient(to right, #ff9966, #ff5e62)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', filter: 'drop-shadow(0px 0px 5px rgba(255,94,98,0.5))' }}>
              3D HOTDOG
            </h1>
            <p style={{ color: '#aaa', margin: '0 0 40px 0', fontSize: '1.3rem', letterSpacing: '1px' }}>Arcade Snack Attack</p>

            <div style={{ display: 'flex', gap: '20px', justifyContent: 'center', marginBottom: '40px', flexWrap: 'wrap' }}>
                
                {/* Objective Card */}
                <div style={objectiveCardStyle}>
                   <h3 style={{color: '#4dabf7', margin: '0 0 15px 0', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '5px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                       OBJECTIVE <Info size={18}/>
                   </h3>
                   <div style={instrRow}><span style={{color: '#FF4500'}}>●</span> Eat Hotdogs (+100)</div>
                   <div style={instrRow}><span style={{color: '#DC143C'}}>●</span> Eat Fries (+150)</div>
                   <div style={instrRow}><span style={{color: '#FFF'}}>●</span> Avoid Walls & Self</div>
                   <div style={instrRow}><span style={{color: '#FFD700'}}>●</span> Survive Timer to Level Up</div>
                </div>

                {/* Powerups Card */}
                <div style={powerUpCardStyle}>
                   <h3 style={{color: '#e599f7', margin: '0 0 15px 0', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '5px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                       POWER-UPS <Zap size={18}/>
                   </h3>
                   <div style={instrRow}><span style={{color: '#FFD700'}}>■</span> Mustard: +500 Pts</div>
                   <div style={instrRow}><span style={{color: '#00FFFF'}}>●</span> Ghost: Pass thru Self</div>
                   <div style={instrRow}><span style={{color: '#FF4500'}}>🍔</span> Burger: Speed Boost</div>
                </div>
            </div>

            <button onClick={startGame} style={megaBtnStyle}>
              PLAY GAME (F1)
            </button>
            
            <div style={{ marginTop: '30px', fontSize: '1rem', color: '#888', display: 'flex', flexDirection: 'column', gap: '8px' }}>
               <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', alignItems: 'center' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.05)', padding: '5px 10px', borderRadius: '5px' }}><Keyboard size={16}/> WASD / ARROWS</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.05)', padding: '5px 10px', borderRadius: '5px' }}><MousePointer2 size={16}/> TOUCH CONTROLS</span>
               </div>
               <div style={{ display: 'flex', justifyContent: 'center', gap: '15px' }}>
                  <span><b style={{color:'white'}}>F2:</b> Restart</span> <span><b style={{color:'white'}}>F3:</b> Pause</span> <span><b style={{color:'white'}}>F4:</b> Mute</span>
               </div>
            </div>

            {highScores.length > 0 && (
                <div style={{ marginTop: '25px', borderTop: '1px solid #333', paddingTop: '15px' }}>
                    <h4 style={{ margin: '0 0 10px 0', color: '#FFD700' }}>HIGH SCORES</h4>
                    {highScores.slice(0, 3).map((hs, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', width: '50%', margin: '0 auto', color: '#ccc' }}>
                            <span>{i+1}. {hs.name}</span>
                            <span>{hs.score}</span>
                        </div>
                    ))}
                </div>
            )}
          </div>
        </div>
      )}

      {/* Game Over Screen */}
      {gameState === 'GAME_OVER' && (
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <h2 style={{ fontSize: '3rem', color: '#FF4500', marginBottom: '10px', textShadow: '0 0 20px red' }}>GAME OVER</h2>
          <div style={{ fontSize: '1.5rem', marginBottom: '20px' }}>FINAL SCORE: <span style={{ color: '#FFD700' }}>{score}</span></div>
          
          <div style={{ marginBottom: '30px' }}>
            <input 
              type="text" 
              placeholder="ENTER NAME" 
              value={playerName} 
              onChange={(e) => setPlayerName(e.target.value.toUpperCase())}
              maxLength={10}
              style={{ padding: '10px', fontSize: '1.2rem', textAlign: 'center', background: '#333', border: '2px solid #555', color: 'white', borderRadius: '5px', outline: 'none' }}
            />
            <button onClick={saveScore} style={{ ...btnStyle, marginLeft: '10px', padding: '10px 20px' }}>SAVE</button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <button onClick={retryLevel} style={{...btnStyle, backgroundColor: '#e67700', fontSize: '1.2rem', padding: '15px 40px'}}>
                 <RotateCcw size={20} /> RETRY LEVEL
              </button>
              <button onClick={startGame} style={btnStyle}>
                 <Play size={20} /> NEW GAME
              </button>
              <button onClick={() => setGameState('START')} style={{...btnStyle, backgroundColor: 'transparent', border: '1px solid #555'}}>
                 MAIN MENU
              </button>
          </div>
        </div>
      )}

      {/* Touch Controls Overlay */}
      <div style={{ 
          position: 'absolute', bottom: 20, left: 20, 
          display: 'grid', gridTemplateColumns: 'repeat(3, 60px)', gap: '10px',
          opacity: 0.6, touchAction: 'none'
      }}>
          <div></div>
          <button onPointerDown={() => moveQueueRef.current.push({ x: 0, z: -1 })} style={controlBtnStyle}><ChevronUp/></button>
          <div></div>
          <button onPointerDown={() => moveQueueRef.current.push({ x: -1, z: 0 })} style={controlBtnStyle}><ChevronLeft/></button>
          <button onPointerDown={() => moveQueueRef.current.push({ x: 0, z: 1 })} style={controlBtnStyle}><ChevronDown/></button>
          <button onPointerDown={() => moveQueueRef.current.push({ x: 1, z: 0 })} style={controlBtnStyle}><ChevronRight/></button>
      </div>

      {/* Utility Buttons */}
      <div style={{ position: 'absolute', bottom: 20, right: 20, display: 'flex', gap: '10px' }}>
          <button onClick={() => setIsMuted(!isMuted)} style={iconBtnStyle}>
              {isMuted ? <VolumeX /> : <Volume2 />}
          </button>
          <button onClick={togglePause} style={iconBtnStyle}>
              {gameState === 'PAUSED' ? <Play /> : <Pause />}
          </button>
      </div>

      {/* Footer */}
      <div style={{ position: 'absolute', bottom: 5, width: '100%', textAlign: 'center', fontSize: '0.8rem', color: '#555' }}>
        (C) Noam Gold AI 2025 | gold.noam@gmail.com
      </div>
    </div>
  );
};

// Styles
const btnStyle: React.CSSProperties = {
  background: '#339af0', color: 'white', border: 'none', padding: '12px 30px',
  fontSize: '1rem', cursor: 'pointer', borderRadius: '30px', display: 'flex', alignItems: 'center', gap: '10px',
  fontWeight: 'bold', boxShadow: '0 4px 15px rgba(0,0,0,0.3)', transition: 'transform 0.1s'
};

const megaBtnStyle: React.CSSProperties = {
    background: 'linear-gradient(90deg, #FFD700, #FF8C00, #FF4500)',
    color: 'black',
    border: '2px solid white',
    padding: '20px 60px',
    fontSize: '2rem',
    fontWeight: '900',
    fontFamily: 'Arial Black, sans-serif',
    cursor: 'pointer',
    borderRadius: '50px',
    boxShadow: '0 0 25px rgba(255, 69, 0, 0.6)',
    transition: 'transform 0.2s',
    textTransform: 'uppercase'
};

const objectiveCardStyle: React.CSSProperties = {
    background: 'linear-gradient(160deg, rgba(30, 60, 114, 0.4) 0%, rgba(42, 82, 152, 0.2) 100%)',
    border: '1px solid rgba(77, 171, 247, 0.4)',
    boxShadow: '0 0 15px rgba(77, 171, 247, 0.1)',
    padding: '20px', borderRadius: '15px', textAlign: 'left', width: '220px',
    backdropFilter: 'blur(5px)'
};

const powerUpCardStyle: React.CSSProperties = {
    background: 'linear-gradient(160deg, rgba(80, 20, 100, 0.4) 0%, rgba(60, 20, 80, 0.2) 100%)',
    border: '1px solid rgba(229, 153, 247, 0.4)',
    boxShadow: '0 0 15px rgba(229, 153, 247, 0.1)',
    padding: '20px', borderRadius: '15px', textAlign: 'left', width: '220px',
    backdropFilter: 'blur(5px)'
};

const controlBtnStyle: React.CSSProperties = {
  width: '60px', height: '60px', borderRadius: '15px', background: 'rgba(255,255,255,0.2)',
  border: '2px solid rgba(255,255,255,0.3)', color: 'white', display: 'flex', justifyContent: 'center', alignItems: 'center',
  cursor: 'pointer', fontSize: '1.5rem'
};

const iconBtnStyle: React.CSSProperties = {
    background: 'rgba(0,0,0,0.5)', border: 'none', color: 'white', padding: '10px', borderRadius: '50%', cursor: 'pointer'
};

const instrRow: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', fontSize: '0.95rem', color: '#e0e0e0'
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);