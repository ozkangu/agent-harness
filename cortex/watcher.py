"""Markdown file watcher for the issues/ directory."""

from __future__ import annotations

import asyncio
import logging
import shutil
from pathlib import Path

import yaml  # type: ignore[import-untyped]
from watchdog.events import FileSystemEventHandler, FileCreatedEvent
from watchdog.observers import Observer  # type: ignore[attr-defined]

from cortex.board import Board

logger = logging.getLogger(__name__)


def parse_issue_markdown(content: str) -> dict:
    """Parse a markdown file with YAML frontmatter into issue fields."""
    parts = content.split("---", 2)
    if len(parts) < 3:
        raise ValueError("Markdown file must have YAML frontmatter between --- delimiters")

    yaml_text = parts[1].strip()
    body = parts[2].strip()

    metadata = yaml.safe_load(yaml_text) or {}

    return {
        "title": metadata.get("title", "Untitled"),
        "priority": metadata.get("priority", "medium"),
        "labels": metadata.get("labels", []),
        "description": body,
    }


class IssueFileHandler(FileSystemEventHandler):
    """Handles new .md files in the issues/ directory."""

    def __init__(self, board: Board, issues_dir: Path, loop: asyncio.AbstractEventLoop) -> None:
        self.board = board
        self.issues_dir = issues_dir
        self.archived_dir = issues_dir / "archived"
        self.loop = loop

    def on_created(self, event: FileCreatedEvent) -> None:  # type: ignore[override]
        if event.is_directory:
            return
        path = Path(str(event.src_path))
        if path.suffix != ".md":
            return
        if path.parent.name == "archived":
            return

        logger.info("New issue file detected: %s", path.name)
        # Schedule async processing on the event loop
        asyncio.run_coroutine_threadsafe(
            self._process_file(path), self.loop
        )

    async def _process_file(self, path: Path) -> None:
        """Parse the markdown file and create an issue."""
        try:
            content = path.read_text(encoding="utf-8")
            fields = parse_issue_markdown(content)

            issue = await self.board.create_issue(
                title=fields["title"],
                description=fields["description"],
                priority=fields["priority"],
                labels=fields["labels"],
            )
            logger.info("Created issue %s from file %s", issue.key, path.name)

            # Archive the file
            self.archived_dir.mkdir(parents=True, exist_ok=True)
            dest = self.archived_dir / path.name
            shutil.move(str(path), str(dest))
            logger.info("Archived %s -> %s", path.name, dest)

        except Exception:
            logger.exception("Failed to process issue file: %s", path.name)


class IssueWatcher:
    """Watches the issues/ directory for new markdown files."""

    def __init__(self, board: Board, issues_dir: str | Path) -> None:
        self.board = board
        self.issues_dir = Path(issues_dir)
        self._observer: Observer | None = None  # type: ignore[valid-type]

    def start(self, loop: asyncio.AbstractEventLoop) -> None:
        """Start watching the issues directory."""
        self.issues_dir.mkdir(parents=True, exist_ok=True)

        handler = IssueFileHandler(self.board, self.issues_dir, loop)
        self._observer = Observer()
        self._observer.schedule(handler, str(self.issues_dir), recursive=False)
        self._observer.start()
        logger.info("Watching %s for new issue files", self.issues_dir)

    def stop(self) -> None:
        """Stop the file watcher."""
        if self._observer:
            self._observer.stop()  # type: ignore[attr-defined]
            self._observer.join()  # type: ignore[attr-defined]
            self._observer = None
            logger.info("Issue watcher stopped")
