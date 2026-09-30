"use client";

import { useState, useTransition } from "react";
import { MoreVertical, Trash2, Edit, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { deleteProject, editProject } from "@/app/actions";

interface Project {
  id: string;
  name: string;
  description?: string | null;
}

export function ProjectCardMenu({ project }: { project: Project }) {
  const [open, setOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [deletePending, startDeleteTransition] = useTransition();

  function onDelete() {
    startDeleteTransition(async () => {
      try {
        await deleteProject(project.id);
        setDeleteDialogOpen(false);
      } catch (error) {
        console.error(error);
        alert("Failed to delete project");
      }
    });
  }
  
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    try {
      const formData = new FormData(e.currentTarget);
      const name = formData.get("name") as string;
      const description = formData.get("description") as string;
      
      await editProject(project.id, { name, description });
      setOpen(false);
    } catch (e) {
      console.error(e);
      alert("Failed to update project");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
        <DropdownMenuTrigger aria-label={`Actions for ${project.name}`} className="-mr-2 inline-flex size-8 items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium text-muted-foreground opacity-60 outline-none transition-all hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/20 sm:opacity-0 sm:group-hover:opacity-100 sm:data-[state=open]:opacity-100">
          <MoreVertical className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem 
            className="cursor-pointer flex items-center" 
            onClick={() => {
              setDropdownOpen(false);
              setOpen(true);
            }}
          >
            <Edit className="h-4 w-4 mr-2" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            className="cursor-pointer text-destructive focus:bg-destructive/10 focus:text-destructive"
            disabled={deletePending}
            onSelect={() => {
              setDropdownOpen(false);
              setDeleteDialogOpen(true);
            }}
          >
            {deletePending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4 mr-2" />
            )}
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Project</DialogTitle>
            <DialogDescription>
              Update your research project details.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-2">
              <label htmlFor={`name-${project.id}`} className="text-sm font-medium">
                Project Name
              </label>
              <Input 
                id={`name-${project.id}`} 
                name="name" 
                defaultValue={project.name} 
                required 
                disabled={loading} 
              />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor={`desc-${project.id}`} className="text-sm font-medium">
                Description (optional)
              </label>
              <Textarea 
                id={`desc-${project.id}`} 
                name="description" 
                defaultValue={project.description || ""}
                className="resize-none"
                rows={3}
                disabled={loading} 
              />
            </div>
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={(nextOpen) => {
          if (!deletePending) setDeleteDialogOpen(nextOpen);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove &quot;{project.name}&quot; from your projects. This
              action cannot be undone from the app.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletePending}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={deletePending}
              onClick={onDelete}
            >
              {deletePending && <Loader2 className="h-4 w-4 animate-spin" />}
              Delete Project
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
