"use client";

import React, { useRef, useEffect, useState, useMemo } from 'react';

// Icons from popular libraries
import { FaDumbbell, FaBolt } from 'react-icons/fa6';
import { IoFootstepsSharp } from "react-icons/io5";
import { MdSelfImprovement } from "react-icons/md";

// All MediaPipe imports are handled dynamically inside useEffect.

//================================================================================//
//                             TYPES & AI HELPERS                                 //
//================================================================================//

type Landmark = { x: number; y: number; z: number; visibility: number };
type Exercise = 'Strength' | 'Cardio' | 'Yoga' | 'HIIT';

// FIX: Define placeholder types for dynamic imports to satisfy 'no-explicit-any'.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MediaPipeCamera = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MediaPipeResults = any;

// A helper function to calculate angles between three points.
const calculateAngle = (a: Landmark, b: Landmark, c: Landmark): number => {
    if (!a || !b || !c) return 0;
    const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
    let angle = Math.abs((radians * 180.0) / Math.PI);
    if (angle > 180.0) { angle = 360 - angle; }
    return angle;
};


//================================================================================//
//                           THE MAIN SCREEN COMPONENT                            //
//================================================================================//

const LiveAiScreen = () => {
    const webcamRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const cameraRef = useRef<MediaPipeCamera | null>(null);

    // CORE LOGIC FIX: A ref to hold a multi-stage state machine. This prevents miscounts
    // by tracking the full motion (e.g., 'down' -> 'in_motion' -> 'up') instantly
    // without triggering slow re-renders.
    const exerciseStateRef = useRef({ stage: 'start' });

    const [aiStatus, setAiStatus] = useState<'loading' | 'ready' | 'error'>('loading');
    const [feedback, setFeedback] = useState('Initializing AI...');
    const [activeExercise, setActiveExercise] = useState<Exercise>('Strength');
    
    // State for UI display (these values trigger re-renders when they change)
    const [repCount, setRepCount] = useState(0);
    const [timer, setTimer] = useState(0);
    const [isPoseCorrect, setIsPoseCorrect] = useState(false);

    // This effect sets up MediaPipe and the camera. It runs only once.
    useEffect(() => {
        const videoElement = webcamRef.current; 

        const setupAndRunMediaPipe = async () => {
            setAiStatus('loading');
            setFeedback('Loading AI model, please wait...');

            try {
                // Dynamically import MediaPipe modules
                const { Pose, POSE_CONNECTIONS } = await import('@mediapipe/pose');
                const drawingUtils = await import('@mediapipe/drawing_utils');
                const cameraUtils = await import('@mediapipe/camera_utils');
                
                const onResults = (results: MediaPipeResults) => {
                    if (!canvasRef.current || !webcamRef.current) return;
                    
                    const canvasCtx = canvasRef.current.getContext('2d')!;
                    // Set canvas dimensions to match the video frame
                    canvasRef.current.width = webcamRef.current.videoWidth;
                    canvasRef.current.height = webcamRef.current.videoHeight;
                    
                    canvasCtx.save();
                    canvasCtx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
                    // Flip the canvas horizontally for a selfie-view.
                    canvasCtx.translate(canvasRef.current.width, 0);
                    canvasCtx.scale(-1, 1);
                    canvasCtx.drawImage(results.image, 0, 0, canvasRef.current.width, canvasRef.current.height);

                    if (results.poseLandmarks && results.poseLandmarks.length > 0) {
                        // Draw the pose landmarks and connections
                        drawingUtils.drawConnectors(canvasCtx, results.poseLandmarks, POSE_CONNECTIONS, { color: '#A0FF00', lineWidth: 2 });
                        drawingUtils.drawLandmarks(canvasCtx, results.poseLandmarks, { color: 'cyan', radius:  1});
                        analyzePose(results.poseLandmarks);
                    } else {
                        setFeedback("No person detected. Please position yourself in the camera's view.");
                    }
                    canvasCtx.restore();
                };

                const pose = new Pose({
                    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
                });

                pose.setOptions({
                    modelComplexity: 1,
                    smoothLandmarks: true,
                    minDetectionConfidence: 0.5,
                    minTrackingConfidence: 0.5
                });
                
                pose.onResults(onResults);

                if (webcamRef.current) {
                    cameraRef.current = new cameraUtils.Camera(webcamRef.current, {
                        onFrame: async () => await pose.send({ image: webcamRef.current! }),
                        width: 640,
                        height: 480,
                    });
                    await cameraRef.current.start();
                    setAiStatus('ready');
                    setFeedback(`Ready for ${activeExercise}. Get in position.`);
                }
            } catch (error) {
                console.error("Failed to setup MediaPipe:", error);
                setAiStatus('error');
                setFeedback("AI failed to start. Check camera permissions and refresh.");
            }
        };

        setupAndRunMediaPipe();

        // Cleanup function to stop the camera when the component unmounts.
        return () => {
            cameraRef.current?.stop();
            if (videoElement?.srcObject) {
                (videoElement.srcObject as MediaStream).getTracks().forEach(track => track.stop());
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); 

    // This effect runs the timer for Yoga exercises.
    useEffect(() => {
        let interval: NodeJS.Timeout | null = null;
        if (aiStatus === 'ready' && activeExercise === 'Yoga' && isPoseCorrect) {
            interval = setInterval(() => setTimer(prev => prev + 1), 1000);
        } else if (!isPoseCorrect) {
            setTimer(0); // Reset timer if pose is incorrect
        }
        return () => { if (interval) clearInterval(interval); };
    }, [isPoseCorrect, activeExercise, aiStatus]);

    // Resets all exercise-related states.
    const resetExerciseState = () => {
        setRepCount(0);
        setTimer(0);
        setIsPoseCorrect(false);
        exerciseStateRef.current = { stage: 'start' };
    };

    // Handles changing the active exercise.
    const handleExerciseChange = (exercise: Exercise) => {
        setActiveExercise(exercise);
        resetExerciseState();
        setFeedback(`Switched to ${exercise}. Get in position.`);
    };

    // The main dispatcher for pose analysis.
    const analyzePose = (landmarks: Landmark[]) => {
        switch (activeExercise) {
            case 'Strength': analyzeBicepCurls(landmarks); break;
            case 'Cardio': analyzeJumpingJacks(landmarks); break;
            case 'Yoga': analyzeWarriorPose(landmarks); break;
            case 'HIIT': analyzeHighKnees(landmarks); break;
        }
    };

    // --- ROBUST ANALYSIS FUNCTIONS WITH STATE MACHINES ---

    const analyzeBicepCurls = (landmarks: Landmark[]) => { 
      const shoulder = landmarks[11], elbow = landmarks[13], wrist = landmarks[15];
      if (!shoulder || !elbow || !wrist || shoulder.visibility < 0.7 || elbow.visibility < 0.7) {
          setFeedback("Ensure your left arm is fully visible to the camera.");
          return;
      }

      const angle = calculateAngle(shoulder, elbow, wrist);
      const stage = exerciseStateRef.current.stage;

      // Detect "down" state (arm extended)
      if (angle > 160) {
          if (stage === 'up') setFeedback("Lowered fully. Great rep!");
          exerciseStateRef.current.stage = 'down';
      } 
      // Detect "up" state (arm flexed) and increment rep
      else if (angle < 40 && stage === 'down') {
          exerciseStateRef.current.stage = 'up';
          setFeedback("Peak contraction! Lower slowly.");
          setRepCount(prevCount => prevCount + 1);
      }
    };

    const analyzeJumpingJacks = (landmarks: Landmark[]) => {
        const ls=landmarks[11],rs=landmarks[12],lh=landmarks[23],rh=landmarks[24],la=landmarks[27],ra=landmarks[28],lw=landmarks[15],rw=landmarks[16];
        if (!ls || !rs || !lh || !rh || !la || !ra || !lw || !rw || ls.visibility < 0.7) {
            setFeedback("Please face the camera and be fully visible.");
            return;
        }

        const legsApart = Math.abs(la.x - ra.x) > Math.abs(lh.x - rh.x) * 1.2;
        const armsUp = lw.y < ls.y && rw.y < rs.y;
        const stage = exerciseStateRef.current.stage;

        // Detect "down" state
        if (!legsApart && !armsUp) {
            if (stage === 'up') setFeedback("Ready for the next jump!");
            exerciseStateRef.current.stage = 'down';
        } 
        // Detect "up" state and increment rep
        else if (legsApart && armsUp && stage === 'down') {
            exerciseStateRef.current.stage = 'up';
            setFeedback("Excellent! Return to start.");
            setRepCount(prev => prev + 1);
        } else if (stage === 'down' && (legsApart || armsUp)) {
             if (legsApart && !armsUp) setFeedback("Bring your arms up!");
             else if (!legsApart && armsUp) setFeedback("Jump your feet out!");
        }
    };

    const analyzeWarriorPose = (landmarks: Landmark[]) => {
        const ls=landmarks[11],rs=landmarks[12],lw=landmarks[15],lk=landmarks[25],lh=landmarks[23],la=landmarks[27]; 
        if(!ls || !rs || !lk || !lh || !la || ls.visibility < 0.7) {
            setFeedback("Ensure your full body is visible from the side.");
            setIsPoseCorrect(false);
            return;
        }

        const armAngle = calculateAngle(lw, ls, rs);
        const kneeAngle = calculateAngle(lh, lk, la);
        const armsAreStraight = armAngle > 160;
        const kneeIsBent = kneeAngle > 85 && kneeAngle < 110;
        
        if (armsAreStraight && kneeIsBent) {
            if (!isPoseCorrect) setFeedback("Perfect form! Hold it strong.");
            setIsPoseCorrect(true);
        } else {
            setIsPoseCorrect(false);
            if (kneeAngle <= 85) setFeedback("Front knee is bent too much. Ease up slightly.");
            else if (kneeAngle >= 110) setFeedback("Bend the front knee more to a 90-degree angle.");
            else if (!armsAreStraight) setFeedback("Arms are not fully extended. Reach out further!");
        }
    };
    
    const analyzeHighKnees = (landmarks: Landmark[]) => {
        const lh = landmarks[23], lk = landmarks[25], rh = landmarks[24], rk = landmarks[26];
        if (!lh || !lk || !rh || !rk || lh.visibility < 0.7 || rh.visibility < 0.7) {
            setFeedback("Please face the camera, ensuring hips are visible.");
            return;
        }

        const leftKneeUp = lk.y < lh.y;
        const rightKneeUp = rk.y < rh.y;
        const stage = exerciseStateRef.current.stage;

        // Detect left knee up
        if (leftKneeUp && stage !== 'left_up') {
            exerciseStateRef.current.stage = 'left_up';
            setFeedback("Good! Switch.");
            setRepCount(p => p + 1);
        } 
        // Detect right knee up
        else if (rightKneeUp && stage !== 'right_up') {
            exerciseStateRef.current.stage = 'right_up';
            setFeedback("Nice! Switch.");
            setRepCount(p => p + 1);
        } 
        // Detect if both knees are down after being up
        else if (!leftKneeUp && !rightKneeUp && (stage === 'left_up' || stage === 'right_up')) {
            exerciseStateRef.current.stage = 'down';
            setFeedback("Drive those knees up!");
        }
    };
    
    // Memoized navigation items to prevent re-creation on each render.
    const navItems = useMemo(() => [
        { name: 'Strength', icon: FaDumbbell }, { name: 'Cardio', icon: IoFootstepsSharp },
        { name: 'Yoga', icon: MdSelfImprovement }, { name: 'HIIT', icon: FaBolt },
    ], []);

    // === REORGANIZED LAYOUT TO MATCH IMAGE ===
    return (
        <div className="min-h-screen bg-gray-900 font-sans text-white relative overflow-hidden pt-8">
            
            {/* Camera and Canvas take up the full background */}
            <div className="absolute inset-0 z-0">
                <video 
                    ref={webcamRef} 
                    className="hidden" 
                    playsInline 
                    autoPlay 
                    muted
                />
                <canvas
                    ref={canvasRef}
                    className="w-full h-full object-cover transition-opacity duration-500"
                    style={{ opacity: aiStatus === 'ready' ? 1 : 0.3 }}
                />
            </div>
            
            {/* Loading/Error Overlay */}
            {aiStatus !== 'ready' && (
                <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/80">
                    {aiStatus === 'loading' && (
                        <div className="w-16 h-16 border-4 border-green-400/40 border-t-green-400 rounded-full animate-spin mb-6"></div>
                    )}
                    <p className="text-xl font-semibold text-center">{feedback}</p>
                </div>
            )}
            
            {/* Header section containing Nav and Status */}
            <header className="relative z-10 w-full px-4">
                {/* Top Navigation Bar */}
                <nav className="w-full card bg-black/50 py-1.5 mb-110">
                    <div className="flex justify-around items-center">
                        {navItems.map((item) => (
                            <button
                                key={item.name}
                                onClick={() => handleExerciseChange(item.name as Exercise)}
                                className={`flex flex-col items-center space-y-1 transition-colors duration-300 w-20 pb-2 ${
                                    activeExercise === item.name
                                        ? 'text-green-400 border-b-2 border-green-400'
                                        : 'text-gray-400 hover:text-white'
                                }`}
                            >
                                <item.icon className="h-6 w-6" />
                                <span className="text-xs font-semibold">{item.name}</span>
                            </button>
                        ))}
                    </div>
                </nav>

                {/* Status Bar */}
                <div className="flex justify-between items-start text-white bg-black/50 p-3 rounded-lg">
                    <div className="flex-grow">
                        <h2 className="text-lg font-bold">{activeExercise}</h2>
                        <p className="text-sm text-gray-200 min-h-[2rem]">
                            <span className="font-semibold text-green-400">AI Coach: </span>{feedback}
                        </p>
                    </div>
                    <div className="text-right flex-shrink-0 w-20">
                        {activeExercise === 'Yoga' ? (
                            <>
                                <span className="text-3xl font-bold tabular-nums">{timer}</span>
                                <p className="text-xs font-semibold text-gray-400">SECONDS</p>
                            </>
                        ) : (
                            <>
                                <span className="text-3xl font-bold tabular-nums">{repCount}</span>
                                <p className="text-xs font-semibold text-gray-400">REPS</p>
                            </>
                        )}
                    </div>
                </div>
            </header>
        </div>
    );
};

export default LiveAiScreen;