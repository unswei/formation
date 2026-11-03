window.FORMATION_GUIDE = {
  "formation": {
    "version": 1,
    "meta": {
      "name": "Teaching diamond: goalkeeper + 1-2-1",
      "notes": "Illustrative formation for the visual guide. Roles are fixed by player ID. Tune before use on robots."
    },
    "defaults": {
      "attraction": {
        "x": 0.65,
        "y": 0.4
      },
      "minX": -4.2,
      "maxX": 4.0,
      "minY": -2.6,
      "maxY": 2.6
    },
    "modes": {
      "normal_play": {
        "robots": {
          "1": {
            "offset": {
              "x": -4.05,
              "y": 0
            },
            "attraction": {
              "x": 0.05,
              "y": 0.15
            },
            "minX": -4.2,
            "maxX": -3.6,
            "minY": -0.7,
            "maxY": 0.7
          },
          "2": {
            "offset": {
              "x": -2.4,
              "y": 0
            },
            "attraction": {
              "x": 0.45,
              "y": 0.3
            },
            "minX": -3.5,
            "maxX": -0.5,
            "minY": -1.3,
            "maxY": 1.3
          },
          "3": {
            "offset": {
              "x": -0.8,
              "y": 1.65
            },
            "maxX": 2.7,
            "minX": -2.5,
            "minY": 0.25
          },
          "4": {
            "offset": {
              "x": -0.8,
              "y": -1.65
            },
            "maxX": 2.7,
            "minX": -2.5,
            "maxY": -0.25
          },
          "5": {
            "offset": {
              "x": 1.0,
              "y": 0
            },
            "attraction": {
              "x": 0.85,
              "y": 0.55
            },
            "minX": -1.5,
            "maxX": 4.0,
            "minY": -1.8,
            "maxY": 1.8
          }
        }
      },
      "kickoff_us": {
        "defaults": {
          "attraction": {
            "x": 0,
            "y": 0
          }
        },
        "robots": {
          "1": {
            "offset": {
              "x": -4.05,
              "y": 0
            }
          },
          "2": {
            "offset": {
              "x": -2.7,
              "y": 0
            }
          },
          "3": {
            "offset": {
              "x": -1.4,
              "y": 1.65
            }
          },
          "4": {
            "offset": {
              "x": -1.4,
              "y": -1.65
            }
          },
          "5": {
            "offset": {
              "x": -0.3,
              "y": 0
            }
          }
        }
      },
      "kickoff_them": {
        "defaults": {
          "attraction": {
            "x": 0,
            "y": 0
          }
        },
        "robots": {
          "1": {
            "offset": {
              "x": -4.05,
              "y": 0
            }
          },
          "2": {
            "offset": {
              "x": -3.0,
              "y": 0
            }
          },
          "3": {
            "offset": {
              "x": -2.0,
              "y": 1.5
            }
          },
          "4": {
            "offset": {
              "x": -2.0,
              "y": -1.5
            }
          },
          "5": {
            "offset": {
              "x": -1.0,
              "y": 0
            }
          }
        }
      }
    }
  },
  "slides": [
    {
      "slug": "01-diamond",
      "title": "Start with a football diamond.",
      "description": "Keeper + cover + two wide players + forward. Illustrative roles, fixed by robot ID. Robots shown at formation targets."
    },
    {
      "slug": "02-follow",
      "title": "Ball moves. Team shape follows.",
      "description": "Same roles. New targets. Arrows show changes in targets. Opponents are context only; the formation does not read them."
    },
    {
      "slug": "03-offset",
      "title": "Offset sets the starting shape.",
      "description": "At the centre, target = offset (before limits). Coordinates in metres. Own goal: \u2212x. Attack: +x. Top touchline: +y."
    },
    {
      "slug": "04-attraction",
      "title": "Attraction controls the response.",
      "description": "A forward follows more. A keeper holds back. Before clipping: target.x = ball.x \u00d7 attraction.x + offset.x. Same rule for y."
    },
    {
      "slug": "05-limits",
      "title": "Limits keep targets in their zones.",
      "description": "Clip each axis after calculating the target. target = clamp(ball \u00d7 attraction + offset, min, max). Field edges need explicit limits."
    },
    {
      "slug": "06-modes",
      "title": "Game state selects the shape.",
      "description": "Ball position adjusts the selected shape. Lookup order shown above. A missing mode falls back; a missing robot returns no target."
    },
    {
      "slug": "07-behaviour",
      "title": "Formation is the base layer.",
      "description": "Add behaviour above it: press, receive, shoot, recover. Proposed behaviour layer, not implemented here. Formation supplies default positions; behaviour chooses when to leave them."
    },
    {
      "slug": "08-integrate",
      "title": "Give each robot its own target.",
      "description": "Recompute as the ball or game state changes. Caller handles coordinate transforms, stopped states and missing targets. first_half does not mirror coordinates."
    },
    {
      "slug": "09-record",
      "title": "Teach the shape with two snapshots.",
      "description": "In the visualiser: Record new formation. Capture A and B for each player. Move ball \u22650.25 m in both axes; keep samples \u22650.05 m inside limits."
    }
  ],
  "opponents": [
    [
      4.05,
      0
    ],
    [
      2.9,
      -0.65
    ],
    [
      1.7,
      1.9
    ],
    [
      1.65,
      -1.85
    ],
    [
      0.1,
      -0.8
    ]
  ]
};
