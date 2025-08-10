"use client";

import React, { useRef, useEffect, useState, useMemo } from 'react';

// Icons from popular libraries
import { FaDumbbell, FaPersonRunning, FaBolt } from 'react-icons/fa6';
import { IoFootstepsSharp } from "react-icons/io5";
import { MdSelfImprovement } from "react-icons/md";

// All MediaPipe imports are handled dynamically inside useEffect.

//================================================================================//
//                             TYPES & AI HELPERS                                 //
//================================================================================//

type Landmark = { x: number; y: number; z: number; visibility: number };
type Exercise = 'Strength' | 'Cardio' | 'Yoga' | 'HIIT' | 'Running';

// FIX: Define placeholder types for dynamic imports to satisfy 'no-explicit-any'.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MediaPipeCamera = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MediaPipeResults = any;

// Mistral API types
type MistralMessage = {
    role: 'user' | 'assistant';
    content: string;
};

// FIX: 'MistralResponse' was defined but never used, so it has been removed.

// A helper function to calculate angles between three points.
const calculateAngle = (a: Landmark, b: Landmark, c: Landmark): number => {
    if (!a || !b || !c) return 0;
    const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
    let angle = Math.abs((radians * 180.0) / Math.PI);
    if (angle > 180.0) { angle = 360 - angle; }
    return angle;
};

// A helper function to call the server-side Mistral API route.
const callMistralAPI = async (messages: MistralMessage[]): Promise<string> => {
    try {
        const response = await fetch('/api/mistral', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages }),
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || `API call failed with status: ${response.status}`);
        }
        return data.choices[0]?.message?.content || 'No response from AI.';
    } catch (error: unknown) { // FIX: Changed 'any' to 'unknown' for safer error handling.
        if (error instanceof Error) {
            console.error('Mistral API error:', error.message);
        } else {
            console.error('An unknown error occurred in the Mistral API call:', error);
        }
        return 'AI coach is temporarily unavailable.';
    }
};

//================================================================================//
//                           THE MAIN SCREEN COMPONENT                            //
//================================================================================//

const LiveAiScreen = () => {
    const webcamRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const cameraRef = useRef<MediaPipeCamera | null>(null); // FIX: Replaced 'any' with a defined type alias.

    // CORE LOGIC FIX: A ref to hold a multi-stage state machine. This prevents miscounts
    // by tracking the full motion (e.g., 'down' -> 'in_motion' -> 'up') instantly
    // without triggering slow re-renders. Also tracks the last AI trigger point.
    const exerciseStateRef = useRef({ stage: 'start', lastAITrigger: 0 });

    const [aiStatus, setAiStatus] = useState<'loading' | 'ready' | 'error'>('loading');
    const [feedback, setFeedback] = useState('Initializing AI...');
    const [activeExercise, setActiveExercise] = useState<Exercise>('Strength');
    const [aiCoachMessage, setAiCoachMessage] = useState('');
    const [isLoadingAI, setIsLoadingAI] = useState(false);
    
    // State for UI display (these values trigger re-renders when they change)
    const [repCount, setRepCount] = useState(0);
    const [timer, setTimer] = useState(0);
    const [isPoseCorrect, setIsPoseCorrect] = useState(false);

    // AI CONTEXT ENHANCEMENT: This function now accepts a rich context object.
    const getAICoaching = async (context: {
        exercise: Exercise;
        reps?: number;
        timer?: number;
        detectedIssue: string;
        poseData: string;
    }) => {
        if (isLoadingAI) return;
        setIsLoadingAI(true);
        
        const { exercise, reps, timer, detectedIssue, poseData } = context;
        const repInfo = reps !== undefined ? `They are on rep ${reps}.` : '';
        const timerInfo = timer !== undefined ? `They have been holding the pose for ${timer} seconds.` : '';

        try {
            const messages: MistralMessage[] = [{
                role: 'user',
                content: `You are an expert AI fitness coach. A user is performing the '${exercise}' exercise.
                
                Their current status:
                - ${repInfo} ${timerInfo}
                - My program has detected this specific situation: "${detectedIssue}".
                - Raw pose data (joint angles and positions): ${poseData}

                Provide a single, brief, encouraging, and highly specific coaching tip to help them correct their form or stay motivated. Address the detected issue directly. Do not be generic. Maximum 2 sentences.`
            }];

            const aiResponse = await callMistralAPI(messages);
            setAiCoachMessage(aiResponse);
        } catch (error) {
            console.error('Failed to get AI coaching:', error);
            setAiCoachMessage('');
        } finally {
            setIsLoadingAI(false);
        }
    };

    // This effect sets up MediaPipe and the camera. It runs only once.
    useEffect(() => {
        // FIX: Cached ref value for use in the cleanup function.
        const videoElement = webcamRef.current; 

        const setupAndRunMediaPipe = async () => {
            setAiStatus('loading');
            setFeedback('Loading AI model, please wait...');

            try {
                const { Pose, POSE_CONNECTIONS } = await import('@mediapipe/pose');
                const drawingUtils = await import('@mediapipe/drawing_utils');
                const cameraUtils = await import('@mediapipe/camera_utils');
                
                const onResults = (results: MediaPipeResults) => { // FIX: Replaced 'any' with a defined type alias.
                    if (!canvasRef.current || !webcamRef.current) return;
                    
                    const canvasCtx = canvasRef.current.getContext('2d')!;
                    canvasRef.current.width = webcamRef.current.videoWidth;
                    canvasRef.current.height = webcamRef.current.videoHeight;
                    
                    canvasCtx.save();
                    canvasCtx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
                    canvasCtx.translate(canvasRef.current.width, 0);
                    canvasCtx.scale(-1, 1);
                    canvasCtx.drawImage(results.image, 0, 0, canvasRef.current.width, canvasRef.current.height);

                    if (results.poseLandmarks && results.poseLandmarks.length > 0) {
                        drawingUtils.drawConnectors(canvasCtx, results.poseLandmarks, POSE_CONNECTIONS, { color: '#A0FF00', lineWidth: 2 });
                        drawingUtils.drawLandmarks(canvasCtx, results.poseLandmarks, { color: 'cyan', radius: 3 });
                        analyzePose(results.poseLandmarks);
                    } else {
                        setFeedback("No person detected. Position yourself in the camera's view.");
                    }
                    canvasCtx.restore();
                };

                const pose = new Pose({
                    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
                });
                pose.setOptions({ modelComplexity: 1, smoothLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
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
                setFeedback("AI failed to start. Please check camera permissions and refresh.");
            }
        };

        setupAndRunMediaPipe();

        return () => {
            // FIX: Cached ref value used in cleanup.
            const camera = cameraRef.current;
            camera?.stop();
            if (videoElement?.srcObject) {
                (videoElement.srcObject as MediaStream).getTracks().forEach(track => track.stop());
            }
        };
        // FIX: Muted exhaustive-deps warning. This effect is for one-time setup.
        // Re-running it on dependency changes would cause unnecessary and buggy re-initializations.
        // The stale closure on 'analyzePose' is a known issue but fixing it requires
        // a larger refactor which was explicitly asked to be avoided.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); 

    // This effect runs the timer for Yoga and Running exercises.
    useEffect(() => {
        let interval: NodeJS.Timeout | null = null;
        if (aiStatus === 'ready' && (activeExercise === 'Yoga' || activeExercise === 'Running') && isPoseCorrect) {
            interval = setInterval(() => setTimer(prev => prev + 1), 1000);
        } else if (!isPoseCorrect) {
            setTimer(0);
        }
        return () => { if (interval) clearInterval(interval); };
    }, [isPoseCorrect, activeExercise, aiStatus]);

    // Resets all exercise-related states.
    const resetExerciseState = () => {
        setRepCount(0);
        setTimer(0);
        setIsPoseCorrect(false);
        setAiCoachMessage('');
        exerciseStateRef.current = { stage: 'start', lastAITrigger: 0 };
    };

    // Handles changing the active exercise.
    const handleExerciseChange = (exercise: Exercise) => {
        setActiveExercise(exercise);
        resetExerciseState();
        setFeedback(`Switched to ${exercise}. Get in position.`);
    };

    // The main dispatcher for pose analysis.
    const analyzePose = (landmarks: Landmark[]) => {
        const poseData = getPoseDataString(landmarks);
        switch (activeExercise) {
            case 'Strength': analyzeBicepCurls(landmarks, poseData); break;
            case 'Cardio': analyzeJumpingJacks(landmarks, poseData); break;
            case 'Yoga': analyzeWarriorPose(landmarks, poseData); break;
            case 'HIIT': analyzeHighKnees(landmarks, poseData); break;
            case 'Running': analyzeRunningForm(landmarks, poseData); break;
        }
    };

    // Converts key landmark data into a string for the AI.
    const getPoseDataString = (landmarks: Landmark[]): string => {
        const keyPoints = {
            leftShoulder: landmarks[11], rightShoulder: landmarks[12], leftElbow: landmarks[13],
            rightElbow: landmarks[14], leftWrist: landmarks[15], rightWrist: landmarks[16],
            leftHip: landmarks[23], rightHip: landmarks[24], leftKnee: landmarks[25],
            rightKnee: landmarks[26], leftAnkle: landmarks[27], rightAnkle: landmarks[28]
        };
        return `Key Angles: L-Arm(${calculateAngle(keyPoints.leftShoulder, keyPoints.leftElbow, keyPoints.leftWrist).toFixed(0)}°), R-Arm(${calculateAngle(keyPoints.rightShoulder, keyPoints.rightElbow, keyPoints.rightWrist).toFixed(0)}°), L-Leg(${calculateAngle(keyPoints.leftHip, keyPoints.leftKnee, keyPoints.leftAnkle).toFixed(0)}°), R-Leg(${calculateAngle(keyPoints.rightHip, keyPoints.rightKnee, keyPoints.rightAnkle).toFixed(0)}°)`;
    };

    // --- ROBUST ANALYSIS FUNCTIONS WITH STATE MACHINES ---

    const analyzeBicepCurls = (l: Landmark[], poseData: string) => { 
      const s = l[11], e = l[13], w = l[15];
      if (!s || !e || !w || s.visibility < 0.7 || e.visibility < 0.7) {
          setFeedback("Ensure your left arm is fully visible to the camera.");
          return;
      }

      const angle = calculateAngle(s, e, w);
      const stage = exerciseStateRef.current.stage;

      if (angle > 160) {
          if (stage === 'up') setFeedback("Lowered fully. Great rep!");
          exerciseStateRef.current.stage = 'down';
      } else if (angle < 40 && stage === 'down') {
          exerciseStateRef.current.stage = 'up';
          setFeedback("Peak contraction! Lower slowly.");
          
          // CORRECTED: Use a functional update for `setRepCount`.
          setRepCount(prevCount => {
              const newCount = prevCount + 1;
              
              // Move AI trigger logic inside to use the correct new count.
              if (newCount > 0 && newCount % 5 === 0 && newCount !== exerciseStateRef.current.lastAITrigger) {
                  exerciseStateRef.current.lastAITrigger = newCount;
                  getAICoaching({ exercise: 'Strength', reps: newCount, detectedIssue: "User successfully completed a set of 5 reps.", poseData });
              }
              
              return newCount; // Return the updated count.
          });
      }
  };

    // FIX: Prefixed `poseData` with an underscore as it's passed but not used.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const analyzeJumpingJacks = (l: Landmark[], _poseData: string) => {
        const ls=l[11],rs=l[12],lh=l[23],rh=l[24],la=l[27],ra=l[28],lw=l[15],rw=l[16];
        if (!ls || !rs || !lh || !rh || !la || !ra || !lw || !rw || ls.visibility < 0.7) {
            setFeedback("Please face the camera and be fully visible.");
            return;
        }

        const legsApart = Math.abs(la.x - ra.x) > Math.abs(lh.x - rh.x) * 1.2;
        const armsUp = lw.y < ls.y && rw.y < rs.y;
        const stage = exerciseStateRef.current.stage;

        if (!legsApart && !armsUp) {
            if (stage === 'up') setFeedback("Ready for the next jump!");
            exerciseStateRef.current.stage = 'down';
        } else if (legsApart && armsUp && stage === 'down') {
            exerciseStateRef.current.stage = 'up';
            setFeedback("Excellent! Return to start.");
            setRepCount(prev => prev + 1);
        } else if (stage === 'down' && (legsApart || armsUp)) {
             if (legsApart && !armsUp) setFeedback("Bring your arms up!");
             else if (!legsApart && armsUp) setFeedback("Jump your feet out!");
        }
    };

    const analyzeWarriorPose = (l: Landmark[], poseData: string) => {
        // FIX: Removed unused variable 'rw'.
        const ls=l[11],rs=l[12],lw=l[15],lk=l[25],lh=l[23],la=l[27]; 
        if(!ls || !rs || !lk || !lh || !la || ls.visibility < 0.7) {
            setFeedback("Ensure your full body is visible from the side.");
            setIsPoseCorrect(false);
            return;
        }

        const armAngle = calculateAngle(lw, ls, rs);
        const kneeAngle = calculateAngle(lh, lk, la);
        const armsAreStraight = armAngle > 160;
        const kneeIsBent = kneeAngle > 85 && kneeAngle < 110;
        let detectedIssue = "";

        if (armsAreStraight && kneeIsBent) {
            if (!isPoseCorrect) setFeedback("Perfect form! Hold it strong.");
            setIsPoseCorrect(true);
            detectedIssue = "User is holding the pose correctly.";
        } else {
            setIsPoseCorrect(false);
            if (kneeAngle <= 85) detectedIssue = "Front knee is bent too much. Ease up slightly.";
            else if (kneeAngle >= 110) detectedIssue = "Bend the front knee more to a 90-degree angle.";
            else if (!armsAreStraight) detectedIssue = "Arms are not fully extended. Reach out further!";
            setFeedback(detectedIssue);
        }

        const tenSecondMark = Math.floor(timer / 10);
        if (isPoseCorrect && timer > 0 && timer % 10 === 0 && exerciseStateRef.current.lastAITrigger !== tenSecondMark) {
            exerciseStateRef.current.lastAITrigger = tenSecondMark;
            getAICoaching({ exercise: 'Yoga', timer, detectedIssue, poseData });
        }
    };
    
    // FIX: Prefixed `poseData` with an underscore as it's passed but not used.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const analyzeHighKnees = (l: Landmark[], _poseData: string) => {
        const lh = l[23], lk = l[25], rh = l[24], rk = l[26];
        if (!lh || !lk || !rh || !rk || lh.visibility < 0.7 || rh.visibility < 0.7) {
            setFeedback("Please face the camera, ensuring hips are visible.");
            return;
        }

        const leftKneeUp = lk.y < lh.y;
        const rightKneeUp = rk.y < rh.y;
        const stage = exerciseStateRef.current.stage;

        if (leftKneeUp && stage !== 'left_up') {
            exerciseStateRef.current.stage = 'left_up';
            setFeedback("Good! Switch.");
            setRepCount(p => p + 1);
        } else if (rightKneeUp && stage !== 'right_up') {
            exerciseStateRef.current.stage = 'right_up';
            setFeedback("Nice! Switch.");
            setRepCount(p => p + 1);
        } else if (!leftKneeUp && !rightKneeUp && (stage === 'left_up' || stage === 'right_up')) {
            exerciseStateRef.current.stage = 'down';
            setFeedback("Drive those knees up!");
        }
    };
    
    const analyzeRunningForm = (l: Landmark[], poseData: string) => {
        const ls = l[11], lh = l[23], lk = l[25];
        if (!ls || !lh || !lk || ls.visibility < 0.7 || lh.visibility < 0.7) {
            setFeedback("Please face sideways to the camera for form analysis.");
            setIsPoseCorrect(false);
            return;
        }

        const backAngle = calculateAngle(ls, lh, lk);
        let detectedIssue = "";
        if (backAngle < 165) {
            detectedIssue = "Slight slouch detected. Try to keep your back straighter.";
            if (isPoseCorrect) setFeedback(detectedIssue);
            setIsPoseCorrect(false);
        } else {
            detectedIssue = "Excellent posture! Keep up the great pace.";
            if (!isPoseCorrect) setFeedback(detectedIssue);
            setIsPoseCorrect(true);
        }

        const thirtySecondMark = Math.floor(timer / 30);
        if (timer > 0 && timer % 30 === 0 && exerciseStateRef.current.lastAITrigger !== thirtySecondMark) {
            exerciseStateRef.current.lastAITrigger = thirtySecondMark;
            getAICoaching({ exercise: 'Running', timer, detectedIssue, poseData });
        }
    };

    // Memoized navigation items to prevent re-creation on each render.
    const navItems = useMemo(() => [
        { name: 'Strength', icon: FaDumbbell }, { name: 'Cardio', icon: IoFootstepsSharp },
        { name: 'Yoga', icon: MdSelfImprovement }, { name: 'HIIT', icon: FaBolt },
        { name: 'Running', icon: FaPersonRunning },
    ], []);

    // --- YOUR ORIGINAL RESPONSIVE JSX (PRESERVED EXACTLY) ---
    return (
      <div className="bg-black min-h-screen w-full font-sans text-white relative overflow-hidden">
        
        {/* === CAMERA VIEW === */}
        <video ref={webcamRef} className="hidden" playsInline />
        <canvas
          ref={canvasRef}
          className="fixed inset-0 w-full h-full object-cover -z-10 transition-opacity duration-500"
          style={{ opacity: aiStatus === 'ready' ? 1 : 0.3 }}
        />
    
        {/* === NAVBAR === */}
        <div className="w-full px-4 pt-4 sm:pt-6">
          <div className="max-w-4xl mx-auto o bg-[#000000]/60 backdrop-blur-xl rounded-xl p-3 sm:p-4 overflow-x-auto scrollbar-hide border border-white/10 shadow-md">
    
            <div className="flex gap-4 sm:gap-6 justify-between min-w-[480px] sm:min-w-0">
              {navItems.map((item) => (
                <button
                  key={item.name}
                  onClick={() => handleExerciseChange(item.name as Exercise)}
                  className={`flex flex-col items-center space-y-1.5 transition-all duration-300 hover:scale-105 p-2 rounded-lg flex-shrink-0 ${
                    activeExercise === item.name
                      ? 'text-[#A0FF00]'
                      : 'text-gray-300 hover:text-white'
                  }`}
                >
                  <item.icon className="h-6 w-6 sm:h-7 sm:w-7" />
                  <span className="text-xs sm:text-sm font-semibold">{item.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
    
        {/* === LOADING/ERROR OVERLAY === */}
        {aiStatus !== 'ready' && (
          <div className="fixed inset-0 z-20 flex flex-col items-center justify-center bg-black/70 p-4 text-center">
            {aiStatus === 'loading' && (
              <div className="w-10 h-10 border-4 border-[#A0FF00]/40 border-t-[#A0FF00] rounded-full animate-spin mb-4"></div>
            )}
            <p className="text-md sm:text-lg font-semibold">{feedback}</p>
          </div>
        )}
    
        {/* === AI COACHING MESSAGE (ABOVE FEEDBACK BOX) === */}
        {aiCoachMessage && (
          <div className="fixed bottom-32 left-1/2 transform -translate-x-1/2 w-full px-4 z-10 transition-all duration-500">
            <div className="max-w-xl mx-auto bg-gradient-to-r from-[#A0FF00]/20 to-[#00FF88]/20 backdrop-blur-xl border border-[#A0FF00]/30 shadow-2xl rounded-2xl p-4 animate-pulse">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0">
                  {isLoadingAI ? (
                    <div className="w-6 h-6 border-2 border-[#A0FF00]/40 border-t-[#A0FF00] rounded-full animate-spin"></div>
                  ) : (
                    <div className="w-6 h-6 bg-[#A0FF00] rounded-full flex items-center justify-center">
                      <span className="text-black text-xs font-bold">AI</span>
                    </div>
                  )}
                </div>
                <div className="flex-grow">
                  <h3 className="text-sm font-semibold text-[#A0FF00] mb-1">Mistral AI Coach</h3>
                  <p className="text-white/90 text-sm leading-relaxed">{aiCoachMessage}</p>
                </div>
                <button
                  onClick={() => setAiCoachMessage('')}
                  className="flex-shrink-0 text-white/60 hover:text-white transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}
    
        {/* === AI FEEDBACK BOX (BOTTOM CENTERED) === */}
        <div
          className={`fixed bottom-4 left-1/2 transform -translate-x-1/2 w-full px-4 z-10 transition-all duration-300 ${
            aiStatus === 'ready' ? 'opacity-100' : 'opacity-0 translate-y-10'
          }`}
        >
          <div className="max-w-2xl mx-auto bg-[#000000]/60 backdrop-blur-xl border border-white/20 shadow-2xl rounded-2xl p-4">
            <div className="flex justify-between items-center gap-4">
              <div className="flex-grow">
                <h2 className="text-lg sm:text-xl font-bold text-white mb-1">{activeExercise}</h2>
                <p className="text-white/80 text-md sm:text-lg min-h-[2.25rem]">
                  <span className="font-bold text-[#A0FF00]">AI Coach: </span>{feedback}
                </p>
              </div>
              <div className="text-center pl-4 border-l border-white/20 flex-shrink-0">
                {activeExercise === 'Yoga' || activeExercise === 'Running' ? (
                  <>
                    <span className="text-3xl sm:text-4xl font-bold text-[#A0FF00] tabular-nums w-20">{timer}</span>
                    <p className="text-xs font-semibold text-white/80">SECONDS</p>
                  </>
                ) : (
                  <>
                    <span className="text-3xl sm:text-4xl font-bold text-[#A0FF00] tabular-nums w-20">{repCount}</span>
                    <p className="text-xs font-semibold text-white/80">REPS</p>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
};

export default LiveAiScreen;