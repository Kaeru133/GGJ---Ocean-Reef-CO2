extends CharacterBody2D
class_name PlayerController

# 🌊 WATER PHYSICS & MOVEMENT
@export_category("Movement feel")
@export var floaty_gravity: float = 400.0  # Slow, sinking feeling
@export var glide_speed: float = 200.0     # Horizontal glide speed
@export var water_friction: float = 2000.0 # Higher friction to make movement feel heavy but intentional

# 🦈 PREDATOR BOOST SYSTEM (DASH & CHAINING)
@export_category("Predator Boost")
@export var dash_speed: float = 800.0
@export var dash_duration: float = 0.2
@export var boost_velocity: float = -600.0 # Negative is UP in Godot 2D

var is_dashing: bool = false
var dash_timer: float = 0.0
var can_dash: bool = true

func _ready() -> void:
    # Forces the node to draw our placeholder dot
    queue_redraw()

func _draw() -> void:
    # Draws a Cyan dot! When you get real art, you can delete this _draw() function.
    draw_circle(Vector2.ZERO, 32.0, Color.CYAN)

func _physics_process(delta: float) -> void:
    if is_dashing:
        handle_dash_state(delta)
    else:
        handle_floaty_movement(delta)

    # Let Godot handle collisions and sliding
    move_and_slide()

    # Reset dashing if we somehow land on solid ground (e.g. coral)
    if is_on_floor():
        can_dash = true

func handle_floaty_movement(delta: float) -> void:
    # 1. Apply floaty underwater gravity
    if not is_on_floor():
        velocity.y += floaty_gravity * delta

    # 2. Horizontal glides
    var direction := Input.get_axis("ui_left", "ui_right")
    
    # Smoothly accelerate toward the desired glide speed
    if direction != 0:
        velocity.x = move_toward(velocity.x, direction * glide_speed, water_friction * delta)
    else:
        # Water slows you down when no input is pressed
        velocity.x = move_toward(velocity.x, 0, (water_friction / 2.0) * delta)

    # 3. Check for Dash input (The main movement tool)
    if Input.is_action_just_pressed("dash") and can_dash:
        start_dash()

func start_dash() -> void:
    is_dashing = true
    can_dash = false # You cannot dash again until you strike an enemy or hit ground
    dash_timer = dash_duration
    
    # Get any directional input (allows omni-directional dashing)
    var input_dir := Vector2(
        Input.get_axis("ui_left", "ui_right"),
        Input.get_axis("ui_up", "ui_down")
    ).normalized()
    
    # If no input, default to dashing forward based on current facing direction
    if input_dir == Vector2.ZERO:
        input_dir = Vector2(sign(velocity.x) if velocity.x != 0 else 1.0, 0)
        
    velocity = input_dir * dash_speed
    
    # TODO: Enable a hurtbox area here so hitting an enemy registers the attack

func handle_dash_state(delta: float) -> void:
    dash_timer -= delta
    if dash_timer <= 0:
        # Dash finished without hitting anything
        is_dashing = false
        # Preserve a little momentum but lose the sharp dash speed
        velocity *= 0.5 

# ==============================================================
# 🔹 CORE MECHANIC: STRIKING AN ENEMY (CHAIN KILLING)
# ==============================================================
func on_enemy_struck(enemy_position: Vector2) -> void:
    """
    Called by the enemy/hitbox when the player's dash connects.
    This triggers the Predator Boost launch and resets the dash.
    """
    
    # 1. Cancel dash state
    is_dashing = false
    
    # 2. Launch player upward! (The main gimmick)
    velocity.y = boost_velocity
    
    # Keep some horizontal momentum for flow
    velocity.x *= 0.7 
    
    # 3. Reset the dash so we can chain mid-air
    can_dash = true
    
    # TODO: Add screen shake, Hatmehyt voice SFX, energy absorb particles here
    print("Predator Boost Triggered! Absorbed energy and launching upward.")
