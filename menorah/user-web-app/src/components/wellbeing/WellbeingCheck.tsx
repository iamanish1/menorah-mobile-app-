'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowLeft, CheckCircle2, ChevronLeft, HeartHandshake, ShieldCheck, Sparkles, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';

const questions = [
  'I have felt cheerful and in good spirits.',
  'I have felt calm and relaxed.',
  'I have felt active and vigorous.',
  'I woke up feeling fresh and rested.',
  'My daily life has been filled with things that interest me.',
];

const answers = [
  { value: 5, label: 'All of the time' },
  { value: 4, label: 'Most of the time' },
  { value: 3, label: 'More than half of the time' },
  { value: 2, label: 'Less than half of the time' },
  { value: 1, label: 'Some of the time' },
  { value: 0, label: 'At no time' },
];

export function WellbeingCheck() {
  const [responses, setResponses] = useState<Array<number | undefined>>(() => Array(questions.length).fill(undefined));
  const [questionIndex, setQuestionIndex] = useState(0);
  const [showResult, setShowResult] = useState(false);

  const answeredCount = responses.filter((response) => response !== undefined).length;
  const score = responses.reduce<number>((total, response) => total + (response ?? 0), 0);
  const percentage = score * 4;
  const isLowWellbeing = score < 13;
  const isLastQuestion = questionIndex === questions.length - 1;

  const selectAnswer = (value: number) => {
    setResponses((previous) => previous.map((response, index) => index === questionIndex ? value : response));
  };

  const advance = () => {
    if (responses[questionIndex] === undefined) return;
    if (isLastQuestion) {
      try {
        window.localStorage.setItem('wellbeing-check-prompt-v1', 'completed');
      } catch {}
      setShowResult(true);
      return;
    }
    setQuestionIndex((current) => current + 1);
  };

  const startAgain = () => {
    setResponses(Array(questions.length).fill(undefined));
    setQuestionIndex(0);
    setShowResult(false);
  };

  if (showResult) {
    return (
      <div className="page-container mx-auto max-w-2xl py-8 sm:py-12">
        <section className="card overflow-hidden">
          <div className="border-b border-primary-100 bg-primary-50 px-6 py-7 text-center dark:border-primary-800 dark:bg-primary-900/70 sm:px-10">
            <CheckCircle2 className="mx-auto mb-3 h-11 w-11 text-primary-600 dark:text-primary-300" aria-hidden="true" />
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-primary-700 dark:text-primary-200">Your private check-in</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-gray-950 dark:text-primary-50">Your wellbeing score</h1>
          </div>

          <div className="space-y-6 px-6 py-7 sm:px-10 sm:py-9">
            <div className="rounded-3xl border border-primary-100 bg-white p-6 text-center dark:border-primary-800 dark:bg-primary-950/50">
              <p className="text-5xl font-black text-primary-700 dark:text-primary-200">{percentage}</p>
              <p className="mt-1 text-sm font-semibold text-gray-500 dark:text-primary-100/65">out of 100 · {score} out of 25</p>
            </div>

            {isLowWellbeing ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-800/70 dark:bg-amber-950/30">
                <HeartHandshake className="mb-3 h-7 w-7 text-amber-700 dark:text-amber-300" aria-hidden="true" />
                <h2 className="text-lg font-black text-amber-950 dark:text-amber-100">It could be a good time to reach out.</h2>
                <p className="mt-2 text-sm leading-6 text-amber-900/85 dark:text-amber-100/80">A score below 50 can be a signal to consider a fuller check-in with a qualified mental-health professional. This result is not a diagnosis.</p>
              </div>
            ) : (
              <div className="rounded-2xl border border-primary-100 bg-primary-50 p-5 dark:border-primary-800 dark:bg-primary-900/40">
                <Sparkles className="mb-3 h-7 w-7 text-primary-700 dark:text-primary-300" aria-hidden="true" />
                <h2 className="text-lg font-black text-primary-950 dark:text-primary-50">Thank you for checking in.</h2>
                <p className="mt-2 text-sm leading-6 text-primary-900/80 dark:text-primary-100/80">This reflects the past two weeks only. You can return whenever you want to check in again, and it is not a diagnosis.</p>
              </div>
            )}

            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-800 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-100">
              <div className="flex gap-3"><TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" /><p>If you feel at risk of harming yourself or someone else, call your local emergency service now or go to the nearest emergency department. <Link href="/profile/crisis-help" className="font-bold underline underline-offset-2">View crisis resources</Link>.</p></div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link href="/discover" className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:bg-primary-500 dark:hover:bg-primary-400">
                Find a counsellor
              </Link>
              <Button variant="secondary" className="flex-1" onClick={startAgain}>Take it again</Button>
            </div>
          </div>
        </section>

        <p className="mt-5 text-center text-xs leading-5 text-gray-500 dark:text-primary-100/60">Based on the WHO-5 Well-Being Index. © World Health Organization 2024, <a href="https://www.who.int/publications/m/item/WHO-UCN-MSD-MHE-2024.01" target="_blank" rel="noreferrer" className="underline underline-offset-2">CC BY-NC-SA 3.0 IGO</a>.</p>
      </div>
    );
  }

  return (
    <div className="page-container mx-auto max-w-2xl py-8 sm:py-12">
      <Link href="/discover" className="mb-6 inline-flex items-center gap-1.5 text-sm font-semibold text-gray-500 transition-colors hover:text-primary-700 dark:text-primary-100/65 dark:hover:text-primary-100"><ArrowLeft className="h-4 w-4" /> Back to Discover</Link>

      <section className="card overflow-hidden">
        <div className="border-b border-primary-100 bg-primary-50 px-6 py-7 dark:border-primary-800 dark:bg-primary-900/70 sm:px-10">
          <div className="flex items-start gap-4"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary-600 text-white dark:bg-primary-500"><HeartHandshake className="h-6 w-6" aria-hidden="true" /></span><div><p className="text-sm font-bold uppercase tracking-[0.18em] text-primary-700 dark:text-primary-200">Private wellbeing check</p><h1 className="mt-1 text-3xl font-black tracking-tight text-gray-950 dark:text-primary-50">A moment for yourself</h1></div></div>
          <p className="mt-5 text-sm leading-6 text-gray-600 dark:text-primary-100/75">Think about the past two weeks. Your answers stay in this browser while you take the check and are not saved to your account.</p>
          <div className="mt-5 flex items-center gap-3 text-xs font-bold text-primary-800 dark:text-primary-100"><ShieldCheck className="h-4 w-4" aria-hidden="true" /> 5 questions · about 2 minutes · not a diagnosis</div>
        </div>

        <div className="px-6 py-7 sm:px-10 sm:py-9">
          <div className="mb-7"><div className="mb-2 flex items-center justify-between text-xs font-bold text-gray-500 dark:text-primary-100/65"><span>Question {questionIndex + 1} of {questions.length}</span><span>{answeredCount} answered</span></div><div className="h-2 overflow-hidden rounded-full bg-primary-100 dark:bg-primary-900"><div className="h-full rounded-full bg-primary-600 transition-all duration-200 dark:bg-primary-400" style={{ width: `${((questionIndex + 1) / questions.length) * 100}%` }} /></div></div>

          <fieldset>
            <legend className="text-xl font-black leading-snug text-gray-950 dark:text-primary-50">Over the past two weeks, {questions[questionIndex]}</legend>
            <p className="mt-2 text-sm text-gray-500 dark:text-primary-100/65">Choose the answer that feels closest.</p>
            <div className="mt-6 grid gap-2" role="radiogroup" aria-label={`Question ${questionIndex + 1}`}>
              {answers.map(({ value, label }) => {
                const selected = responses[questionIndex] === value;
                return <button key={value} type="button" role="radio" aria-checked={selected} onClick={() => selectAnswer(value)} className={cn('flex min-h-12 items-center justify-between rounded-xl border px-4 text-left text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2', selected ? 'border-primary-600 bg-primary-600 text-white dark:border-primary-400 dark:bg-primary-500' : 'border-gray-200 bg-white text-gray-700 hover:border-primary-300 hover:bg-primary-50 dark:border-primary-800 dark:bg-primary-950/40 dark:text-primary-100 dark:hover:border-primary-600 dark:hover:bg-primary-900/60')}><span>{label}</span><span className={cn('ml-4 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs', selected ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500 dark:bg-primary-900 dark:text-primary-100/70')}>{value}</span></button>;
              })}
            </div>
          </fieldset>

          <div className="mt-7 flex items-center justify-between gap-3">
            {questionIndex === 0 ? <span /> : <Button variant="secondary" onClick={() => setQuestionIndex((current) => current - 1)}><ChevronLeft className="h-4 w-4" /> Back</Button>}
            <Button disabled={responses[questionIndex] === undefined} onClick={advance}>{isLastQuestion ? 'See my check-in' : 'Next question'}</Button>
          </div>
        </div>
      </section>

      <p className="mt-5 text-center text-xs leading-5 text-gray-500 dark:text-primary-100/60">This check supports reflection; it does not provide medical advice or diagnose a mental-health condition.</p>
    </div>
  );
}
