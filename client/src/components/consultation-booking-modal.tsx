import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, Clock, MessageSquare, Phone, User, Mail, CheckCircle } from "lucide-react";
import { formatPhone } from "@/lib/phone";

const topics = [
  "Country & Job Recommendations",
  "CV / Resume Preparation",
  "Overseas Job Application Help",
  "NEA Agency Verification",
  "Student Visa Guidance",
  "Work Permit / Visa Process",
  "Salary Negotiation",
  "General Career Guidance",
];

const timeSlots = [
  "08:00", "09:00", "10:00", "11:00",
  "12:00", "13:00", "14:00", "15:00",
  "16:00", "17:00",
];

const schema = z.object({
  userName: z.string().min(2, "Enter your full name"),
  userEmail: z.string().email("Enter a valid email").optional().or(z.literal("")),
  userPhone: z.string().min(9, "Enter a valid WhatsApp number"),
  topic: z.string().min(1, "Select a topic"),
  date: z.string().min(1, "Select a date"),
  time: z.string().min(1, "Select a time"),
  notes: z.string().max(500).optional(),
});

type FormData = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ConsultationBookingModal({ open, onOpenChange }: Props) {
  const { toast } = useToast();
  const [booked, setBooked] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      userName: "", userEmail: "", userPhone: "",
      topic: "", date: "", time: "", notes: "",
    },
  });

  const bookMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const scheduledDate = new Date(`${data.date}T${data.time}:00`).toISOString();
      return apiRequest("POST", "/api/consultations", {
        userName: data.userName,
        userEmail: data.userEmail || undefined,
        userPhone: data.userPhone,
        topic: data.topic,
        notes: data.notes || undefined,
        scheduledDate,
      });
    },
    onSuccess: () => {
      setBooked(true);
    },
    onError: (err: any) => {
      toast({
        title: "Booking failed",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const today = new Date();
  today.setDate(today.getDate() + 1);
  const minDate = today.toISOString().split("T")[0];
  const maxDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  function handleClose() {
    if (!bookMutation.isPending) {
      onOpenChange(false);
      setTimeout(() => { setBooked(false); form.reset(); }, 300);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <MessageSquare className="h-5 w-5 text-teal-600" />
            Book a WhatsApp Consultation
          </DialogTitle>
          <DialogDescription>
            Fill in your details and preferred time. We'll confirm your slot within 24 hours via WhatsApp.
          </DialogDescription>
        </DialogHeader>

        {booked ? (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle className="h-9 w-9 text-green-600" />
            </div>
            <h3 className="text-lg font-semibold text-slate-800">Booking Received!</h3>
            <p className="text-slate-600 text-sm max-w-xs">
              We've sent a WhatsApp message to confirm your request. Our team will confirm your slot within 24 hours.
            </p>
            <Button onClick={handleClose} className="mt-2 bg-teal-600 hover:bg-teal-700">
              Done
            </Button>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit((d) => bookMutation.mutate(d))} className="space-y-4">
              <FormField control={form.control} name="userName" render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-1.5"><User className="h-3.5 w-3.5" /> Full Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Jane Njoroge" data-testid="input-consultation-name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="userPhone" render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> WhatsApp Number</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="+1 XXX XXX XXXX or +254 7XX XXX XXX"
                      data-testid="input-consultation-phone"
                      {...field}
                      onChange={(e) => field.onChange(formatPhone(e.target.value))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="userEmail" render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" /> Email (optional)</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="jane@example.com" data-testid="input-consultation-email" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="topic" render={({ field }) => (
                <FormItem>
                  <FormLabel>Consultation Topic</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-consultation-topic">
                        <SelectValue placeholder="What do you need help with?" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {topics.map(t => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="date" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" /> Preferred Date</FormLabel>
                    <FormControl>
                      <Input type="date" min={minDate} max={maxDate} data-testid="input-consultation-date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="time" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Preferred Time</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-consultation-time">
                          <SelectValue placeholder="Time" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {timeSlots.map(t => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel>Additional Notes (optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Tell us a bit about your situation or what you'd like to focus on..."
                      rows={3}
                      data-testid="textarea-consultation-notes"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <div className="flex gap-3 pt-2">
                <Button type="button" variant="outline" onClick={handleClose} className="flex-1" disabled={bookMutation.isPending}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="flex-1 bg-teal-600 hover:bg-teal-700"
                  disabled={bookMutation.isPending}
                  data-testid="button-book-consultation"
                >
                  {bookMutation.isPending ? "Booking..." : "Book Consultation"}
                </Button>
              </div>

              <p className="text-xs text-slate-500 text-center">
                You'll receive a WhatsApp confirmation within 24 hours. Consultations are conducted via WhatsApp.
              </p>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
