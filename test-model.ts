import Model from 'https://agentscript.org/models/SchellingModel.js'

const model = new Model()
model.setup()
for (let i = 0; i < 5; i++) {
  model.step()
  console.log(model.ticks, model.percentHappy, model.turtles.length, model.done)
}
console.log('sample turtle', model.turtles[0].x, model.turtles[0].y, model.turtles[0].breed.name)
