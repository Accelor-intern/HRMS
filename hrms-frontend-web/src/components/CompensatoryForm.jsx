import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Label } from "../components/ui/label";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { useToast } from "../hooks/use-toast";
import api from "../services/api";

function CompensatoryForm({ open, onOpenChange, compRecord, onClaimSuccess }) {
  const { toast } = useToast();
  const [projectName, setProjectName] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!projectName || !description) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Project Name and Description are required.",
      });
      return;
    }

    setIsSubmitting(true);
    const payload = {
      date: compRecord.date,
      hours: Number(compRecord.hours),
      projectName,
      description,
    };

    console.log("Submitting Compensatory with payload:", payload);

    try {
      const response = await api.post("/compensatory", payload);
      toast({
        title: "Success",
        description: "Compensatory claim submitted successfully!",
      });
      onClaimSuccess(response.data);
      onOpenChange(false);
    } catch (error) {
      console.error("Compensatory Claim Error:", error.response?.data || error.message);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.response?.data?.error || error.response?.data?.message || "Failed to submit compensatory claim.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Apply for Compensatory Hours</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Display pre-filled data */}
            <div className="space-y-2">
              <Label>Date</Label>
              <Input
                value={new Date(compRecord?.date).toLocaleDateString() || ""}
                readOnly
                className="bg-gray-100 cursor-not-allowed"
              />
            </div>
            <div className="space-y-2">
              <Label>Day</Label>
              <Input
                value={compRecord?.day || ""}
                readOnly
                className="bg-gray-100 cursor-not-allowed"
              />
            </div>
            <div className="space-y-2">
              <Label>Hours</Label>
              <Input
                value={compRecord?.hours || ""}
                readOnly
                className="bg-gray-100 cursor-not-allowed"
              />
            </div>
            {/* Project Name */}
            <div className="space-y-2">
              <Label htmlFor="projectName">Project Name</Label>
              <Input
                id="projectName"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="Enter project name"
                required
              />
            </div>
            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Enter description"
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Submitting..." : "Submit"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default CompensatoryForm;