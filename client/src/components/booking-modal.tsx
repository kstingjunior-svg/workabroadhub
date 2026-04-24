import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Calendar, Clock, MessageCircle, CheckCircle, Phone, User,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useFirebasePresence } from "@/hooks/use-firebase-presence";
import { bookConsultation, TIME_SLOTS } from "@/lib/firebase-bookings";

interface BookingModalProps {
  open: boolean;
  onClose: () => void;
  advisor: {
    id: string;
    name: string;
    specialization: string;
    title: string;
  };
}

function getTodayStr() {
  return new Date().toISOString().split("T")[0];
}

function formatSlot(slot: string) {
  const [h, m] = slot.split(":").map(Number);
  const ampm = h < 12 ? "AM" : "PM";
  const h12 = h % 12 || 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

export function BookingModal({ open, onClose, advisor }: BookingModalProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const { myVisitorId } = useFirebasePresence();

  const [selectedDate, setSelectedDate] = useState(getTodayStr());
  const [selectedTime, setSelectedTime] = useState("");
  const [userName, setUserName] = useState(
    user ? [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email?.split("@")[0] || "" : ""
  );
  const [whatsapp, setWhatsapp] = useState(user?.phone ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleBook() {
    if (!selectedDate || !selectedTime || !userName.trim() || !whatsapp.trim()) return;
    setSubmitting(true);
    try {
      await bookConsultation({
        advisorId: advisor.id,
        advisorName: advisor.name,
        advisorSpecialty: advisor.specialization,
        userId: user?.id ?? myVisitorId ?? "anonymous",
        userName: userName.trim(),
        dateTime: `${selectedDate}T${selectedTime}`,
        whatsappNumber: whatsapp.trim(),
      });
      setSubmitted(true);
      toast({
        title: "Booking confirmed! 🎉",
        description: `Your session with ${advisor.name} is set for ${new Date(`${selectedDate}T${selectedTime}`).toLocaleString()}. You'll be contacted on WhatsApp.`,
      });
    } catch {
      toast({ title: "Booking failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    setSelectedTime("");
    setSubmitted(false);
    onClose();
  }

  const minDate = getTodayStr();
  const isValid = selectedDate && selectedTime && userName.trim() && whatsapp.trim();

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-purple-600" />
            Book a Session
          </DialogTitle>
        </DialogHeader>

        {submitted ? (
          <div className="py-6 text-center space-y-4">
            <CheckCircle className="h-14 w-14 text-emerald-500 mx-auto" />
            <div>
              <p className="font-bold text-lg text-gray-800 dark:text-gray-100">Booking Confirmed!</p>
              <p className="text-sm text-muted-foreground mt-1">
                <strong>{advisor.name}</strong> · {advisor.specialization}
              </p>
            </div>
            <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg p-4 text-sm text-emerald-800 dark:text-emerald-300 space-y-1">
              <p><strong>📅</strong> {new Date(`${selectedDate}T${selectedTime}`).toLocaleDateString("en-KE", { weekday: "long", month: "long", day: "numeric" })}</p>
              <p><strong>🕐</strong> {formatSlot(selectedTime)}</p>
              <p><strong>📱</strong> We'll reach you at {whatsapp} on WhatsApp</p>
            </div>
            <Button variant="outline" onClick={handleClose} data-testid="button-close-booking-modal">
              Done
            </Button>
          </div>
        ) : (
          <div className="space-y-5 py-1">
            {/* Advisor summary */}
            <div className="flex items-center gap-3 p-3 bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 rounded-lg">
              <div className="h-11 w-11 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-white font-bold text-base shrink-0">
                {advisor.name.split(" ").map(n => n[0]).join("")}
              </div>
              <div>
                <p className="font-semibold text-gray-800 dark:text-gray-100 text-sm">{advisor.name}</p>
                <Badge variant="secondary" className="text-xs mt-0.5 bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300">
                  {advisor.specialization}
                </Badge>
              </div>
            </div>

            {/* Date */}
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-200 flex items-center gap-1.5 mb-2">
                <Calendar className="h-4 w-4 text-muted-foreground" /> Select Date
              </label>
              <input
                type="date"
                value={selectedDate}
                min={minDate}
                onChange={e => { setSelectedDate(e.target.value); setSelectedTime(""); }}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-400"
                data-testid="input-booking-date"
              />
            </div>

            {/* Time slots */}
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-200 flex items-center gap-1.5 mb-2">
                <Clock className="h-4 w-4 text-muted-foreground" /> Select Time (EAT)
              </label>
              <div className="grid grid-cols-5 gap-2">
                {TIME_SLOTS.map(slot => (
                  <button
                    key={slot}
                    onClick={() => setSelectedTime(slot)}
                    className={`py-2 rounded-lg text-xs font-medium border transition-colors ${
                      selectedTime === slot
                        ? "bg-purple-600 text-white border-purple-600"
                        : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-purple-400"
                    }`}
                    data-testid={`slot-${slot}`}
                  >
                    {formatSlot(slot)}
                  </button>
                ))}
              </div>
            </div>

            {/* Name */}
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-200 flex items-center gap-1.5 mb-2">
                <User className="h-4 w-4 text-muted-foreground" /> Your Name
              </label>
              <input
                type="text"
                value={userName}
                onChange={e => setUserName(e.target.value)}
                placeholder="Full name"
                maxLength={80}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-400"
                data-testid="input-booking-name"
              />
            </div>

            {/* WhatsApp */}
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-200 flex items-center gap-1.5 mb-2">
                <Phone className="h-4 w-4 text-muted-foreground" /> WhatsApp Number
              </label>
              <input
                type="tel"
                value={whatsapp}
                onChange={e => setWhatsapp(e.target.value)}
                placeholder="+254712345678"
                maxLength={20}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-400"
                data-testid="input-booking-whatsapp"
              />
              <p className="text-xs text-muted-foreground mt-1">Your advisor will confirm via WhatsApp before the session.</p>
            </div>

            <Button
              onClick={handleBook}
              disabled={!isValid || submitting}
              className="w-full bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-400 hover:to-indigo-500 text-white gap-2 h-10"
              data-testid="button-confirm-booking"
            >
              <MessageCircle className="h-4 w-4" />
              {submitting ? "Booking…" : "Confirm Booking"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
