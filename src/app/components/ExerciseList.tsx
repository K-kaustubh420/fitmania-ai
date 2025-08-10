// src/app/components/ExerciseList.tsx
import React from 'react';

// This type can be exported and used by other components
export type ExerciseType = 'Bicep Curl' | 'Squat' | 'Overhead Press';

interface ExerciseListProps {
  onSelectExercise: (exercise: ExerciseType) => void;
}

const exercises: ExerciseType[] = ['Bicep Curl', 'Squat', 'Overhead Press'];

const ExerciseList: React.FC<ExerciseListProps> = ({ onSelectExercise }) => {
  return (
    <div className="text-center animate-fadeIn">
      <h1 className="text-4xl font-bold mb-2 text-white">Start Workout</h1>
      <p className="text-[#888888] mb-10">Select an exercise to get real-time feedback.</p>
      
      <div className="space-y-4 max-w-md mx-auto">
        {exercises.map((exercise) => (
          <button
            key={exercise}
            onClick={() => onSelectExercise(exercise)}
            className="w-full bg-[#1E1E1E] p-5 rounded-xl text-left text-xl font-semibold text-white
                       hover:ring-2 hover:ring-[#A0FF00] transition-all duration-200 ease-in-out
                       focus:outline-none focus:ring-2 focus:ring-[#A0FF00]"
          >
            {exercise}
          </button>
        ))}
      </div>
    </div>
  );
};

export default ExerciseList;