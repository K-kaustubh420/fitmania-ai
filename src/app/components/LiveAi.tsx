"use client";

import React, { useRef, useEffect, useState } from 'react';
import { ExerciseType } from './ExerciseList'; // Assumes ExerciseList.tsx is in the same folder

// Define the component's props interface
interface LiveAiProps {
  exercise: ExerciseType | null;
}

// Helper function to calculate the angle between three points
const calculateAngle = (a: any, b: any, c: any): number => {
    // Check for valid landmark data
    if (!a || !b || !c) return 0;
    
    const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
    let angle = Math.abs((radians * 180.0) / Math.PI);

    if (angle > 180.0) {
      angle = 360 - angle;
    }
    return angle;
};


const LiveAi: React.FC<LiveAiProps> = ({ exercise }) => {
  const webcamRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [feedback, setFeedback] = useState('Initializing AI...');
  
  // Use 'any' type for the camera ref because the Camera class is loaded dynamically
  const cameraRef = useRef<any | null>(null);

  useEffect(() => {
    // This master function handles the entire lifecycle of MediaPipe
    const setupAndRunMediaPipe = async () => {
      // Set initial feedback
      setFeedback('Loading AI model...');

      try {
        // Dynamically import all necessary MediaPipe modules.
        // This is CRITICAL for Next.js to prevent server-side rendering errors.
        const { Pose, POSE_CONNECTIONS } = await import('@mediapipe/pose');
        const { drawConnectors, drawLandmarks } = await import('@mediapipe/drawing_utils');
        const { Camera } = await import('@mediapipe/camera_utils');
        
        // --- ANALYSIS FUNCTIONS (Defined inside setup to access `calculateAngle`) ---
        
        const analyzeBicepCurls = (landmarks: any) => {
            const shoulder = landmarks[11]; // Left Shoulder
            const elbow = landmarks[13];    // Left Elbow
            const wrist = landmarks[15];    // Left Wrist
            
            if (shoulder?.visibility > 0.5 && elbow?.visibility > 0.5 && wrist?.visibility > 0.5) {
                const angle = calculateAngle(shoulder, elbow, wrist);
                if (angle > 160) {
                    setFeedback('Correct: Down position');
                } else if (angle < 30) {
                    setFeedback('Correct: Curled position');
                } else {
                    setFeedback('In Progress...');
                }
            } else {
                setFeedback('Make sure your left arm is fully visible.');
            }
        };

        const analyzeSquats = (landmarks: any) => {
            const hip = landmarks[23];   // Left Hip
            const knee = landmarks[25];  // Left Knee
            const ankle = landmarks[27]; // Left Ankle

            if (hip?.visibility > 0.5 && knee?.visibility > 0.5 && ankle?.visibility > 0.5) {
                const kneeAngle = calculateAngle(hip, knee, ankle);
                if (kneeAngle > 160) {
                    setFeedback('Correct: Standing position');
                } else if (kneeAngle < 90) {
                    setFeedback('Good depth! Press up.');
                } else {
                    setFeedback('Lower your hips.');
                }
            } else {
                setFeedback('Make sure your left leg is fully visible.');
            }
        };

        const analyzeOverheadPress = (landmarks: any) => {
            const shoulder = landmarks[11]; // Left Shoulder
            const elbow = landmarks[13];    // Left Elbow
            const wrist = landmarks[15];    // Left Wrist
            
            if (shoulder?.visibility > 0.5 && elbow?.visibility > 0.5 && wrist?.visibility > 0.5) {
                const elbowAngle = calculateAngle(shoulder, elbow, wrist);
                const isArmUp = wrist.y < elbow.y;

                if (elbowAngle > 160 && isArmUp) {
                    setFeedback('Correct: Top position');
                } else if (elbowAngle < 90 && elbowAngle > 60 && !isArmUp) {
                    setFeedback('Correct: Down position. Press up!');
                } else {
                    setFeedback('In Progress...');
                }
            } else {
                setFeedback('Make sure your left arm is fully visible.');
            }
        };


        // This function is called on every frame from the webcam.
        const onResults = (results: any) => {
            if (!canvasRef.current) return;
            const canvasCtx = canvasRef.current.getContext('2d')!;
            canvasCtx.save();
            canvasCtx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
            canvasCtx.drawImage(results.image, 0, 0, canvasRef.current.width, canvasRef.current.height);

            if (results.poseLandmarks) {
                // Draw the pose skeleton
                drawConnectors(canvasCtx, results.poseLandmarks, POSE_CONNECTIONS, { color: '#A0FF00', lineWidth: 4 });
                drawLandmarks(canvasCtx, results.poseLandmarks, { color: '#FFFFFF', lineWidth: 2 });
                
                // Call the correct analysis function based on the selected exercise
                switch (exercise) {
                  case 'Bicep Curl': analyzeBicepCurls(results.poseLandmarks); break;
                  case 'Squat': analyzeSquats(results.poseLandmarks); break;
                  case 'Overhead Press': analyzeOverheadPress(results.poseLandmarks); break;
                  default: setFeedback('Select an exercise to begin.');
                }
            }
            canvasCtx.restore();
        };

        // --- INITIALIZATION ---

        const pose = new Pose({
          locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
        });
        pose.setOptions({
          modelComplexity: 1,
          smoothLandmarks: true,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
        pose.onResults(onResults);

        if (webcamRef.current) {
          cameraRef.current = new Camera(webcamRef.current, {
            onFrame: async () => {
              if (webcamRef.current) {
                await pose.send({ image: webcamRef.current });
              }
            },
            width: 640,
            height: 480,
          });
          cameraRef.current.start();
          setFeedback("Ready! Start your first rep.");
        }

      } catch (error) {
        console.error("Failed to setup MediaPipe:", error);
        setFeedback("Error initializing AI. Please refresh.");
      }
    };

    // Run the setup
    setupAndRunMediaPipe();

    // Cleanup function: This is run when the component unmounts or the 'exercise' prop changes.
    return () => {
      if (cameraRef.current) {
        cameraRef.current.stop();
      }
      if (webcamRef.current && webcamRef.current.srcObject) {
        // Manually stop all tracks on the stream
        const stream = webcamRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [exercise]); // Re-run the entire effect if the selected exercise changes

  // --- RENDERED JSX ---

  return (
    <div className="flex flex-col items-center animate-fadeIn">
      <p className="text-[#888888]">Now Analyzing</p>
      <h2 className="text-4xl font-bold text-[#A0FF00] mb-5">{exercise}</h2>
      
      <div className="relative w-full max-w-2xl rounded-xl overflow-hidden ring-2 ring-[#A0FF00] shadow-lg shadow-[#A0FF00]/10">
        {/* This video element is the source for MediaPipe but is not displayed */}
        <video ref={webcamRef} style={{ display: 'none' }} playsInline></video>
        
        {/* The canvas is where the video feed and pose skeleton are drawn */}
        <canvas ref={canvasRef} width="640" height="480" className="w-full h-auto block" />
      </div>

      <div className="mt-6 bg-[#1E1E1E] p-4 rounded-xl w-full max-w-2xl text-center">
        <p className="text-[#888888] text-xs font-bold tracking-widest">FEEDBACK</p>
        <p className="text-white font-semibold text-lg h-6 mt-1">{feedback}</p>
      </div>
    </div>
  );
};

export default LiveAi;