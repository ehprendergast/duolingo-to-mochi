import React from 'react';
import DuolingoProcessor from './components/DuolingoProcessor';
import { Languages, GraduationCap } from 'lucide-react';

function App() {
  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <Languages className="h-8 w-8 text-green-500" />
            <h1 className="text-xl font-bold text-gray-800">Duolingo to Mochi Text Processor</h1>
          </div>
          
          <div className="flex items-center space-x-1">
            <GraduationCap className="h-5 w-5 text-green-600" />
            <span className="text-sm font-medium text-gray-600">Generate Mochi flashcards from Duolingo images</span>
          </div>
        </div>
      </header>
      
      {/* Main content */}
      <main>
        <DuolingoProcessor />
      </main>
      
      {/* Footer */}
      <footer className="bg-white border-t mt-12 py-6">
        <div className="container mx-auto px-4">
          <p className="text-left text-sm text-gray-500 [&_a]:text-green-500 [&_a:hover]:underline [&_a:visited]:text-green-700">
            This tool helps you turn screenshots of <a href='https://duolingo.com'>Duolingo</a> sentences with new vocabulary into <a href='https://mochi.cards'>Mochi</a> flashcards with <a href='https://mochi.cards/docs/#cloze-deletions'>cloze deletions</a>. That way you can review new words you learn on Duolingo with spaced repetition, on your own time and at your own pace. This tool was created free to use by <a href='https://www.linkedin.com/in/eric-h-prendergast/'>Eric Prendergast</a>, and its source code can be found at his <a href='https://github.com/ehprendergast/duolingo-flashcard-builder'>GitHub</a>.
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;