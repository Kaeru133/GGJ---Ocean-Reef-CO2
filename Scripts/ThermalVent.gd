extends Area2D
class_name ThermalVent

# 🌋 THERMAL VENT OVERRIDE PROPERTIES
@export var upward_force: float = -1200.0 # Massive launch upwards compared to a regular enemy
@export var grab_player_horizontally: float = 5.0 # Drag constraint to keep player looking awesome inside the vent

func _ready() -> void:
    monitoring = true
    connect("body_entered", Callable(self, "_on_body_entered"))
    connect("body_exited", Callable(self, "_on_body_exited"))
    queue_redraw()

func _draw() -> void:
    # Draws an Orange dot! When you get real art, you can delete this _draw() function.
    draw_circle(Vector2.ZERO, 40.0, Color.ORANGE)

func _on_body_entered(body: Node2D) -> void:
    if body is PlayerController:
        # Did Karu use the Thermal Dash to enter?
        # The design says: "Dash through vents → massive launch upward"
        if body.is_dashing:
            launch_player(body)
        else:
            # If they just drift into it, maybe it only pushes them slightly, or boils them
            # For now, let's just push them gently
            body.velocity.y += upward_force * 0.2
            
func _on_body_exited(body: Node2D) -> void:
    if body is PlayerController:
        pass # Stop gentle pushing if we added continuous physics

func launch_player(player: PlayerController) -> void:
    # 1. Mega massive launch! 🚀
    player.is_dashing = false 
    player.can_dash = true # Give dash back immediately for chaining
    
    player.velocity.y = upward_force
    
    # 2. Add visual aesthetic logic
    # Pull player towards the horizontal line of the vent so they shoot straight up
    var dir_to_center = global_position.x - player.global_position.x
    player.velocity.x += dir_to_center * grab_player_horizontally
    
    # TODO: Intense rumble, massive bubble particles
    print("Thermal Vent dashed! Launched high into the ocean.")
