extends Area2D
class_name TargetableEnemy

# ☠️ ENEMY PROPERTIES
@export var health: int = 1
@export var energy_yield: int = 10 # Energy absorbed when struck by Karu
@export var is_gas_phantom: bool = true

@onready var sprite = $Sprite2D
@onready var collision_shape = $CollisionShape2D

func _ready() -> void:
    # Guarantee the Area2D is actively looking for bodies (the Player)
    monitoring = true
    connect("body_entered", Callable(self, "_on_body_entered"))
    queue_redraw()

func _draw() -> void:
    # Draws a Sickly Green dot! When you get real art, you can delete this _draw() function.
    draw_circle(Vector2.ZERO, 32.0, Color.GREEN_YELLOW)

func _on_body_entered(body: Node2D) -> void:
    # Check if the body colliding with us is the Player
    if body is PlayerController:
        # Did Karu hit us while dashing (attacking)?
        if body.is_dashing:
            take_damage(body)
        else:
            # If not dashing, the player just bumped into a hostile enemy 
            # and should probably take damage.
            # body.take_damage(1) 
            pass

func take_damage(player: PlayerController) -> void:
    health -= 1
    
    # ==============================================================
    # 💥 THE PREDATOR BOOST HOOK
    # This calls the function on the player to launch them upwards!
    # ==============================================================
    player.on_enemy_struck(global_position)
    
    if health <= 0:
        die()

func die() -> void:
    # 1. Disable collisions immediately so the player doesn't hit it twice
    collision_shape.set_deferred("disabled", true)
    
    # 2. Hide sprite or play a transition
    if sprite != null:
        sprite.visible = false
    
    # TODO: Instantiate sickle green/yellow pollution explosion 
    # TODO: Play satisfactory shatter/absorb SFX
    
    # 3. Destroy the enemy entity
    queue_free()
