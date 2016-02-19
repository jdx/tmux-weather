tmux-weather
============

Show weather in tmux status line. No powerline needed.

Installation
============
Copy `tmux-weather` into PATH.

```
cp ./tmux-weather /usr/local/bin/tmux-weather
```

Add this (or something like it) to `~/.tmux.conf`:

```
set -g status-right '#(~/bin/tmux-weather)'
```
