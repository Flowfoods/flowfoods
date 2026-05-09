'use client';

interface Props {
  className?: string;
  children: React.ReactNode;
}

export default function ModalTriggerButton({ className, children }: Props) {
  const handleClick = () => {
    window.dispatchEvent(new CustomEvent('flowfoods:open-modal'));
  };
  return (
    <button onClick={handleClick} className={className}>
      {children}
    </button>
  );
}
